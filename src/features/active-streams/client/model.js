// Session formatting and badge policy. No DOM or network dependencies.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const internal = JE.internals.activeStreams = JE.internals.activeStreams || {};

    // ── Helpers ──────────────────────────────────────────────────────────────
    const ticksToTime = (ticks) => {
        if (!ticks) return '0:00';
        const totalSec = Math.floor(ticks / 10000000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    // ── Badge builder ────────────────────────────────────────────────────────
    const getBadges = (session) => {
        const badges = [];
        const ts = session.TranscodingInfo;
        const ps = session.PlayState || {};

        if (ts && ts.IsVideoDirect === false) {
            badges.push({ label: 'Transcoding', cls: 'je-as-badge-transcode' });
            if (ts.VideoCodec) badges.push({ label: ts.VideoCodec.toUpperCase(), cls: 'je-as-badge-neutral' });
            if (ts.AudioCodec) badges.push({ label: ts.AudioCodec.toUpperCase(), cls: 'je-as-badge-neutral' });
            if (ts.Bitrate) {
                const kbps = Math.round(ts.Bitrate / 1000);
                badges.push({ label: kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`, cls: 'je-as-badge-neutral' });
            }
            if (ts.Width && ts.Height) {
                badges.push({ label: `${ts.Width}\u00d7${ts.Height}`, cls: 'je-as-badge-neutral' });
            }
            if (ts.Framerate) {
                badges.push({ label: `${Math.round(ts.Framerate)}fps`, cls: 'je-as-badge-neutral' });
            }
        } else {
            badges.push({ label: 'Direct Play', cls: 'je-as-badge-direct' });
            const stream = session.NowPlayingItem?.MediaStreams?.find(s => s.Type === 'Video');
            if (stream?.Codec) badges.push({ label: stream.Codec.toUpperCase(), cls: 'je-as-badge-neutral' });
            if (stream?.BitRate) {
                const kbps = Math.round(stream.BitRate / 1000);
                badges.push({ label: kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`, cls: 'je-as-badge-neutral' });
            }
        }

        if (ps.PlayMethod === 'Transcode' && ts?.TranscodeReasons?.length) {
            const streams = session.NowPlayingItem?.MediaStreams || [];
            for (const rawReason of ts.TranscodeReasons) {
                const reason = rawReason.replace(/([A-Z])/g, ' $1').trim();
                badges.push({ label: reason, cls: 'je-as-badge-reason' });

                // Append codec conversion arrow for codec-related reasons
                if (rawReason === 'AudioCodecNotSupported') {
                    const srcCodec = streams.find(s => s.Type === 'Audio')?.Codec;
                    const dstCodec = ts.AudioCodec;
                    if (srcCodec && dstCodec && srcCodec.toLowerCase() !== dstCodec.toLowerCase()) {
                        badges.push({ label: `${srcCodec.toUpperCase()} → ${dstCodec.toUpperCase()}`, cls: 'je-as-badge-reason' });
                    }
                } else if (rawReason === 'VideoCodecNotSupported') {
                    const srcCodec = streams.find(s => s.Type === 'Video')?.Codec;
                    const dstCodec = ts.VideoCodec;
                    if (srcCodec && dstCodec && srcCodec.toLowerCase() !== dstCodec.toLowerCase()) {
                        badges.push({ label: `${srcCodec.toUpperCase()} → ${dstCodec.toUpperCase()}`, cls: 'je-as-badge-reason' });
                    }
                }
            }
        }

        return badges;
    };

    internal.model = { ticksToTime, getBadges };
})(window.JellyfinEnhanced);
