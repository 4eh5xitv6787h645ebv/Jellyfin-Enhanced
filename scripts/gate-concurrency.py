#!/usr/bin/env python3
"""Throughput of K gate runs at once on one machine (several agents finishing together).

    scripts/gate-concurrency.py --worktrees DIR1,DIR2,... --levels 1,2,3,4 [--gate all] [--repeat 1] [--out FILE.json]

For each level K it starts the gate in K of the worktrees at the same moment, waits for all, and records each run's
wall time and exit code, the level's makespan (last finish), throughput (gates per hour), the machine's CPU use, the
lowest MemAvailable, swap in use, and the 1-minute load. The caller should hold the shared gate lock for the whole
experiment (the runs inside it pass the lock to nobody; they are the experiment), so no other agent's gate runs beside.

Guard: if MemAvailable falls below --min-mem-mb (default 1500) every run of the level is killed (SIGKILL, process
groups) and the level is recorded as `killed for memory`: the experiment must never push the machine into the OOM
killer, which could pick another agent's process.
"""
import argparse
import json
import os
import signal
import socket
import subprocess
import time
from pathlib import Path


def meminfo():
    m = {}
    for line in open('/proc/meminfo'):
        k, v = line.split(':', 1)
        m[k] = int(v.split()[0]) // 1024
    return m


def busy():
    v = list(map(int, open('/proc/stat').readline().split()[1:9]))
    return sum(v) - v[3] - v[4], sum(v)


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def level(k, trees, gate, min_mem, logdir, env_extra):
    env = dict(os.environ, UseSharedCompilation='false', MSBUILDDISABLENODEREUSE='1', DOTNET_CLI_USE_MSBUILD_SERVER='0',
               DOTNET_CLI_TELEMETRY_OPTOUT='1', **env_extra)
    env.pop('JE_UPDATE_SNAPSHOTS', None)
    procs = []
    b0, t0 = busy()
    start = time.time()
    for i in range(k):
        log = open(logdir / f'k{k}-run{i + 1}.log', 'w')
        e = dict(env, JE_BROWSER_PORT=str(free_port()))
        p = subprocess.Popen(['bash', 'scripts/restructure-gates.sh', gate], cwd=trees[i], env=e, stdout=log,
                             stderr=subprocess.STDOUT, start_new_session=True)
        procs.append({'p': p, 'start': time.time(), 'tree': trees[i], 'log': log})
    low, swap_max, load_max, killed = 10 ** 9, 0, 0.0, False
    while any(x['p'].poll() is None for x in procs):
        m = meminfo()
        low = min(low, m['MemAvailable'])
        swap_max = max(swap_max, m['SwapTotal'] - m['SwapFree'])
        load_max = max(load_max, os.getloadavg()[0])
        if m['MemAvailable'] < min_mem and not killed:
            killed = True
            for x in procs:
                if x['p'].poll() is None:
                    os.killpg(x['p'].pid, signal.SIGKILL)
        for x in procs:
            if 'end' not in x and x['p'].poll() is not None:
                x['end'] = time.time()
        time.sleep(1)
    for x in procs:
        x.setdefault('end', time.time())
        x['log'].close()
    b1, t1 = busy()
    makespan = max(x['end'] for x in procs) - start
    return {'k': k, 'gate': gate, 'makespan_s': round(makespan, 1),
            'runs': [{'tree': x['tree'], 'rc': x['p'].returncode, 'wall_s': round(x['end'] - x['start'], 1)} for x in procs],
            'gates_per_hour': round(3600 * k / makespan, 1), 'cpu_busy_pct': round(100 * (b1 - b0) / max(1, t1 - t0), 1),
            'min_mem_available_mb': low, 'max_swap_used_mb': swap_max, 'max_load1': round(load_max, 1),
            'killed_for_memory': killed}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--worktrees', required=True)
    ap.add_argument('--levels', default='1,2,3,4')
    ap.add_argument('--gate', default='all')
    ap.add_argument('--repeat', type=int, default=1)
    ap.add_argument('--min-mem-mb', type=int, default=1500)
    ap.add_argument('--env', action='append', default=[])
    ap.add_argument('--out', default='gate-concurrency.json')
    a = ap.parse_args()
    trees = a.worktrees.split(',')
    logdir = Path(a.out).with_suffix('.logs')
    logdir.mkdir(parents=True, exist_ok=True)
    extra = dict(kv.split('=', 1) for kv in a.env)
    results = []
    for r in range(a.repeat):
        for k in map(int, a.levels.split(',')):
            if k > len(trees):
                continue
            res = level(k, trees, a.gate, a.min_mem_mb, logdir, extra)
            res['repeat'] = r + 1
            results.append(res)
            print(json.dumps(res), flush=True)
            Path(a.out).write_text(json.dumps(results, indent=1))
            time.sleep(20)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
