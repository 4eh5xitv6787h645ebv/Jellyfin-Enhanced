'use strict';

// Feature composition uses source names. Legacy delivery aliases and historical
// load order are separate host contracts; new modules need neither a new alias
// nor an entry in that historical sequence.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const resourcePrefix = 'Jellyfin.Plugin.JellyfinEnhanced.';

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
        if (['bin', 'obj', '.venv', 'node_modules', 'tests'].includes(entry.name)) return [];
        const name = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(name) : [name];
    });
}

function validatePublicPath(value, script = false) {
    if (typeof value !== 'string' || (script && !value.endsWith('.js'))
        || !value.split('/').every(segment => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(segment))) {
        throw new Error(`Invalid public ${script ? 'module' : 'asset'} path: ${value}`);
    }
}

function readLayout(repository = root) {
    repository = path.resolve(repository);
    const realRepository = fs.realpathSync(repository);
    const readJson = name => JSON.parse(fs.readFileSync(path.join(repository, name), 'utf8'));
    const aliases = readJson('src/host/compatibility/asset-aliases.json');
    const historicalOrder = readJson('src/host/bootstrap/module-order.json');
    if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) throw new Error('Asset aliases must map source paths to public asset paths');
    if (!Array.isArray(historicalOrder) || new Set(historicalOrder).size !== historicalOrder.length) throw new Error('Invalid/duplicate historical module order');
    for (const [source, publicPath] of Object.entries(aliases)) {
        validatePublicPath(source);
        validatePublicPath(publicPath);
    }
    const descriptors = [
        'src/host/feature.json', 'src/shared/feature.json',
        ...fs.readdirSync(path.join(repository, 'src/features'), { withFileTypes: true })
            .filter(entry => entry.isDirectory()).map(entry => `src/features/${entry.name}/feature.json`),
        'src/shared/localization/resources.json'
    ].sort();
    const assets = [], startups = [], modules = new Map();
    const owners = new Set(), resourceNames = new Set(), sourceFiles = new Set(), physicalAssets = new Set();
    const physicalSource = source => fs.realpathSync(path.join(repository, source));
    const isTestSource = source => source.split('/').includes('tests')
        || path.relative(realRepository, physicalSource(source)).split(path.sep).includes('tests');

    for (const descriptor of descriptors) {
        const definition = readJson(descriptor);
        const directory = path.dirname(path.join(repository, descriptor));
        const owner = definition.id;
        const isFeature = descriptor.startsWith('src/features/');
        if (typeof owner !== 'string' || owners.has(owner)) throw new Error(`Invalid/duplicate owner in ${descriptor}`);
        if (isFeature && owner !== path.basename(directory)) throw new Error(`Feature identity does not match its directory: ${descriptor}`);
        owners.add(owner);
        const resolveSource = source => {
            if (typeof source !== 'string') throw new Error(`Missing source in ${descriptor}`);
            const resolved = path.resolve(directory, source);
            if (!resolved.startsWith(repository + path.sep)) throw new Error(`Source escapes repository: ${source}`);
            if (isFeature && !resolved.startsWith(directory + path.sep)) throw new Error(`Feature source belongs to another owner: ${source}`);
            if (!fs.existsSync(resolved)) throw new Error(`Missing source: ${resolved}`);
            if (!fs.statSync(resolved).isFile()) throw new Error(`Source is not a file: ${resolved}`);
            const realSource = fs.realpathSync(resolved);
            if (!realSource.startsWith(realRepository + path.sep)) throw new Error(`Source escapes repository through a symlink: ${source}`);
            if (isFeature && !realSource.startsWith(fs.realpathSync(directory) + path.sep)) throw new Error(`Feature source belongs to another owner through a symlink: ${source}`);
            return path.relative(repository, resolved).split(path.sep).join('/');
        };
        const defaultPath = (local, script) => {
            if (owner === 'locales') return `js/locales/${path.basename(local)}`;
            const relative = local.startsWith('../') ? path.basename(local) : local.replace(/^(client|browser)\//, '');
            const base = isFeature ? `features/${owner}` : owner;
            return `${script ? 'js/' : ''}${base}/${relative}`;
        };
        const addAsset = (local, loader) => {
            const source = resolveSource(local);
            if (isTestSource(source)) throw new Error(`Test source cannot be embedded: ${source}`);
            if (source.endsWith('.js') && !loader) throw new Error(`JavaScript asset needs a loader: ${source}`);
            const publicPath = aliases[source] || defaultPath(local, !!loader);
            validatePublicPath(publicPath, !!loader);
            if (loader && !publicPath.startsWith('js/')) throw new Error(`Script alias must start with js/: ${source}`);
            const resource = resourcePrefix + publicPath.replaceAll('/', '.');
            if (resourceNames.has(resource)) throw new Error(`Duplicate resource: ${resource}`);
            if (sourceFiles.has(source) || physicalAssets.has(physicalSource(source))) throw new Error(`Source has multiple owners: ${source}`);
            resourceNames.add(resource); sourceFiles.add(source); physicalAssets.add(physicalSource(source));
            const asset = { source, resource, owner };
            if (loader) asset[loader.kind] = { path: publicPath.slice(3), ...loader.value };
            assets.push(asset);
            return asset;
        };
        if (definition.modules && (typeof definition.modules !== 'object' || Array.isArray(definition.modules))) throw new Error(`Modules must map sources to named dependencies: ${descriptor}`);
        for (const [local, dependsOn] of Object.entries(definition.modules || {})) {
            if (!local.endsWith('.js')) throw new Error(`Module source must be JavaScript: ${local}`);
            const id = `${owner}/${local.replace(/^(client|browser)\//, '').replace(/\.js$/, '')}`;
            validatePublicPath(id);
            if (modules.has(id)) throw new Error(`Duplicate module: ${id}`);
            if (!Array.isArray(dependsOn) || dependsOn.some(value => typeof value !== 'string') || new Set(dependsOn).size !== dependsOn.length) throw new Error(`Invalid/duplicate named dependencies: ${id}`);
            const asset = addAsset(local, { kind: 'module', value: {} });
            modules.set(id, { id, dependsOn, asset });
        }
        for (const [local, reason] of Object.entries(definition.standalone || {})) {
            if (typeof reason !== 'string' || !reason.trim()) throw new Error(`Standalone script needs a loading reason: ${local}`);
            addAsset(local, { kind: 'standalone', value: { reason } });
        }
        for (const local of definition.assets || []) addAsset(local);
        if (definition.startup) startups.push({ source: resolveSource(definition.startup), owner });
    }

    for (const source of Object.keys(aliases)) {
        if (!sourceFiles.has(source)) throw new Error(`Unused legacy asset alias: ${source}`);
    }
    const locales = path.join(repository, 'locales');
    if (fs.existsSync(locales)) {
        for (const name of fs.readdirSync(locales).filter(name => name.endsWith('.json'))) {
            if (!sourceFiles.has(`locales/${name}`)) throw new Error(`Unregistered locale source: locales/${name}`);
        }
    }

    // Visit prerequisites before each historical module. A new prerequisite is
    // inserted immediately before its consumer, without allowing unrelated old
    // modules to jump ahead of that consumer as a ready-queue scan would.
    const ordered = [], visiting = new Set(), visited = new Set();
    function visit(id) {
        if (visited.has(id)) return;
        const module = modules.get(id);
        if (!module || visiting.has(id)) throw new Error(`Missing or cyclic module dependency: ${id}`);
        visiting.add(id);
        for (const dependency of module.dependsOn) visit(dependency);
        visiting.delete(id); visited.add(id); ordered.push(module);
    }
    for (const id of [...historicalOrder, ...modules.keys()]) visit(id);
    for (const [order, module] of ordered.entries()) {
        Object.assign(module.asset.module, { dependsOn: module.dependsOn.map(id => modules.get(id).asset.module.path), order });
    }
    const manifest = {
        components: ordered.map(({ asset }) => ({ ...asset.module, source: asset.source })),
        standalone: assets.filter(asset => asset.standalone).map(asset => ({ ...asset.standalone, source: asset.source }))
    };

    // Startup sources contain ordinary named functions. Evaluate declarations,
    // then execute only host composition against recording stubs: no feature
    // initialization runs during the build and no numeric step registry exists.
    const startupFiles = new Set(), functions = new Set();
    const rejectAccess = () => { throw new Error('Startup declarations/composition must not access JE; keep feature behavior inside named initializers'); };
    const probe = new Proxy({}, {
        get: rejectAccess, set: rejectAccess, defineProperty: rejectAccess,
        deleteProperty: rejectAccess, ownKeys: rejectAccess, has: rejectAccess,
        getOwnPropertyDescriptor: rejectAccess, getPrototypeOf: rejectAccess,
        setPrototypeOf: rejectAccess, preventExtensions: rejectAccess
    });
    for (const startup of startups) {
        const realSource = physicalSource(startup.source);
        if (isTestSource(startup.source)) throw new Error(`Test source cannot be a startup input: ${startup.source}`);
        if (physicalAssets.has(realSource)) throw new Error(`Private startup source cannot be embedded: ${startup.source}`);
        if (startupFiles.has(realSource)) throw new Error(`Duplicate startup source: ${startup.source}`);
        startupFiles.add(realSource);
        const scope = { JE: probe };
        vm.runInNewContext(fs.readFileSync(path.join(repository, startup.source), 'utf8'), scope, { filename: startup.source, timeout: 1000 });
        startup.functions = Object.keys(scope).filter(name => name !== 'JE');
        if (!startup.functions.length) throw new Error(`Startup source needs named initializers: ${startup.source}`);
        for (const name of startup.functions) {
            if (!/^start[A-Za-z0-9_$]+$/.test(name) || typeof scope[name] !== 'function') throw new Error(`Invalid startup initializer: ${name}`);
            if (functions.has(name)) throw new Error(`Duplicate startup initializer: ${name}`);
            functions.add(name);
        }
    }
    const startupCalls = [];
    const composition = { JE: probe };
    for (const name of functions) composition[name] = argument => {
        if (argument !== probe) throw new Error(`Startup initializer must receive JE: ${name}`);
        if (startupCalls.includes(name)) throw new Error(`Duplicate startup call: ${name}`);
        startupCalls.push(name);
    };
    const coordinator = fs.readFileSync(path.join(repository, 'src/host/bootstrap/feature-startup.js'), 'utf8');
    vm.runInNewContext(`${coordinator}\ninitializeFeatures(JE);`, composition, { filename: 'feature-startup.js', timeout: 1000 });
    for (const name of functions) if (!startupCalls.includes(name)) throw new Error(`Unscheduled startup initializer: ${name}`);
    return { assets, startups, manifest, descriptors: descriptors.map(name => path.join(repository, name)), startupCalls };
}

module.exports = { root, walk, readLayout, validatePublicPath };
