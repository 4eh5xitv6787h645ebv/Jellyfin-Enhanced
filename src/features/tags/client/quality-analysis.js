// Quality detection from Jellyfin media metadata. No DOM, cache, or settings access.
// Public surface: JE.tags.qualityAnalysis.getEnhancedQuality(streams, sources, item).
(function (JE) {
    'use strict';

    /**
     * Finds the richest channel layout available across audio streams.
     * @param {Array} audioStreams - Audio streams from item metadata.
     * @returns {string|null} A channel tag such as "7.1", "5.1", or "2.0".
     */
    function getChannelTag(audioStreams) {
        if (!Array.isArray(audioStreams) || audioStreams.length === 0) return null;

        const rank = { '7.1': 3, '5.1': 2, '2.0': 1 };
        let maxChannels = 0;
        let detectedLayoutTag = null;

        for (const stream of audioStreams) {
            const channels = stream.Channels || 0;
            if (channels > maxChannels) {
                maxChannels = channels;
            }

            const layoutSignals = `${stream.ChannelLayout || ''} ${stream.DisplayTitle || ''}`.toLowerCase();
            let tag = null;
            if (/\b7[. ]?1\b/.test(layoutSignals)) {
                tag = '7.1';
            } else if (/\b5[. ]?1\b/.test(layoutSignals)) {
                tag = '5.1';
            } else if (/\bstereo\b|\b2[. ]?0\b/.test(layoutSignals)) {
                tag = '2.0';
            }

            if (tag && (!detectedLayoutTag || rank[tag] > rank[detectedLayoutTag])) {
                detectedLayoutTag = tag;
            }
        }

        if (detectedLayoutTag) {
            return detectedLayoutTag;
        }

        if (maxChannels >= 8) return '7.1';
        if (maxChannels >= 6) return '5.1';
        if (maxChannels >= 2) return '2.0';

        return null;
    }

    // --- CORE LOGIC ---
    /**
     * Analyzes media stream and source information to determine quality tags.
     * @param {Array} mediaStreams - The MediaStreams array from the Jellyfin item.
     * @param {Array} mediaSources - The MediaSources array from the Jellyfin item.
     * @param {Object} [itemData] - Optional item metadata for filename/title signals.
     * @returns {Array<string>} A list of detected quality tags.
     */
    function getEnhancedQuality(mediaStreams, mediaSources, itemData = null) {
        if (!mediaStreams && !mediaSources) return [];

        const qualities = new Set();
        let videoStreams = [];
        let audioStreams = [];

        if (mediaStreams) {
            videoStreams = mediaStreams.filter(s => s.Type === 'Video');
            audioStreams = mediaStreams.filter(s => s.Type === 'Audio');
        }

        // Also check within MediaSources, as this can sometimes contain more accurate stream info
        if (mediaSources?.[0]?.MediaStreams) {
            const sourceStreams = mediaSources[0].MediaStreams;
            videoStreams = videoStreams.concat(sourceStreams.filter(s => s.Type === 'Video'));
            audioStreams = audioStreams.concat(sourceStreams.filter(s => s.Type === 'Audio'));
        }


        // Get primary video stream for analysis
        const primaryVideoStream = videoStreams[0];

        addImaxTag(qualities, mediaStreams, mediaSources, itemData);
        addResolutionTag(qualities, primaryVideoStream);
        addVideoCodecTag(qualities, primaryVideoStream);
        addDynamicRangeTag(qualities, primaryVideoStream);
        addAudioTag(qualities, audioStreams);
        add3dTag(qualities, mediaSources);
        addMediaStubTag(qualities, mediaSources, itemData);

        return Array.from(qualities);
    }

    function addImaxTag(qualities, mediaStreams, mediaSources, itemData) {
        // --- IMAX TAG LOGIC ---
        // Pattern sources:
        // - TRaSH Guides IMAX CF regex (NON-IMAX exclusion + IMAX token)
        // - Dictionarry-Hub IMAX / IMAX Enhanced patterns
        // We gather multiple title/name/path signals since IMAX often appears in file names.
        const imaxSignals = [];
        if (itemData) {
            imaxSignals.push(
                itemData.Name || '',
                itemData.OriginalTitle || '',
                itemData.SortName || '',
                itemData.EditionTitle || '',
                itemData.ForcedSortName || ''
            );
        }
        if (Array.isArray(mediaSources)) {
            mediaSources.forEach((source) => {
                imaxSignals.push(source?.Path || '', source?.Name || '');
            });
        }
        if (Array.isArray(mediaStreams)) {
            mediaStreams.forEach((stream) => {
                imaxSignals.push(stream?.DisplayTitle || '', stream?.Title || '');
            });
        }

        const imaxContext = imaxSignals.filter(Boolean).join(' | ');
        const nonImaxRegex = /\bNON[ ._-]?IMAX\b/i;
        const imaxRegex = /\bIMAX(?:[ ._-]?ENHANCED)?\b/i;
        if (imaxContext && imaxRegex.test(imaxContext) && !nonImaxRegex.test(imaxContext)) {
            qualities.add('IMAX');
        }
    }

    function addResolutionTag(qualities, primaryVideoStream) {
        // --- VIDEO RESOLUTION LOGIC ---
        let resolutionTag = null;

        if (primaryVideoStream) {
            // Priority 1: DisplayTitle Scan for resolution keywords
            const displayTitle = primaryVideoStream.DisplayTitle || '';
            const resolutionRegex = /\b(8k|4320p|4k|2160p|1440p|1080p|720p|576p|480p|360p|404p|384p|520p)\b/i;
            const resolutionMatch = displayTitle.match(resolutionRegex);

            const displayTitleHeight = primaryVideoStream.Height || 0;
            const isFalsely4k = resolutionMatch &&
                ['4k', '2160p'].includes(resolutionMatch[1].toLowerCase()) &&
                displayTitleHeight > 0 && displayTitleHeight < 1250;

            if (resolutionMatch && !isFalsely4k) {
                const found = resolutionMatch[1].toLowerCase();
                if (found === '8k' || found === '4320p') {
                    resolutionTag = '8K';
                } else if (found === '4k' || found === '2160p') {
                    resolutionTag = '4K';
                } else if (found === '1440p') {
                    resolutionTag = '1440p';
                } else if (found === '1080p') {
                    resolutionTag = '1080p';
                } else if (found === '720p') {
                    resolutionTag = '720p';
                } else if (found === '576p') {
                    resolutionTag = '576p';
                } else if (found === '480p') {
                    resolutionTag = '480p';
                } else if (['360p', '404p', '384p', '520p'].includes(found)) {
                    // Generic low-res tag for anything below 480p
                    resolutionTag = 'LOW-RES';
                }
                qualities.add(resolutionTag);
            } else {
                // Priority 2: Dimension Fallback
                const height = primaryVideoStream.Height || 0;
                const width = primaryVideoStream.Width || 0;
                if (height >= 3000 || width >= 7000) {
                    resolutionTag = '8K';
                } else if (height >= 1550 || width >= 3500) {
                    resolutionTag = '4K';
                } else if (height >= 1250) {
                    resolutionTag = '1440p';
                } else if (height >= 1000) {
                    resolutionTag = '1080p';
                } else if (height >= 700) {
                    resolutionTag = '720p';
                } else if (height >= 528) {
                    // PAL DVD is 720x576; NTSC DVD is 720x480. 528 splits the two evenly.
                    resolutionTag = '576p';
                } else if (height >= 400) {
                    resolutionTag = '480p';
                } else if (height > 0) {
                    // Any height below 400px gets the generic low-res tag
                    resolutionTag = 'LOW-RES';
                }

                if (resolutionTag) {
                    qualities.add(resolutionTag);
                }
            }
        }
    }

    function detectVideoCodec(codec, codecTag = '') {
        let detectedCodec = null;
        if (codec.includes('hevc')) {
            detectedCodec = 'HEVC';
        } else if (codec.includes('h265')) {
            detectedCodec = 'H265';
        } else if (codec.includes('h264') || codec.includes('avc') || codecTag.includes('avc')) {
            detectedCodec = 'H264';
        } else if (codec.includes('av1')) {
            detectedCodec = 'AV1';
        } else if (codec.includes('vp9')) {
            detectedCodec = 'VP9';
        } else if (codec.includes('vp8')) {
            detectedCodec = 'VP8';
        } else if (codec.includes('xvid')) {
            detectedCodec = 'XVID';
        } else if (codec.includes('divx')) {
            detectedCodec = 'DIVX';
        } else if (codec.includes('wmv') || codec.includes('vc1')) {
            detectedCodec = 'WMV';
        } else if (codec.includes('mpeg2')) {
            detectedCodec = 'MPEG2';
        } else if (codec.includes('mpeg4')) {
            detectedCodec = 'MPEG4';
        } else if (codec.includes('mjpeg')) {
            detectedCodec = 'MJPEG';
        } else if (codec.includes('theora')) {
            detectedCodec = 'THEORA';
        }
        return detectedCodec;
    }

    function addVideoCodecTag(qualities, primaryVideoStream) {
        if (!primaryVideoStream) return;
        const codec = (primaryVideoStream.Codec || '').toLowerCase();
        const codecTag = (primaryVideoStream.CodecTag || '').toLowerCase();
        const title = (primaryVideoStream.DisplayTitle || '').toLowerCase();
        const detectedCodec = detectVideoCodec(codec, codecTag) || detectVideoCodec(title);
        if (detectedCodec) qualities.add(detectedCodec);
    }

    function addDynamicRangeTag(qualities, primaryVideoStream) {
        // --- VIDEO DYNAMIC RANGE LOGIC ---
        let hdrTag = null;

        if (primaryVideoStream) {
            // Priority 1: Dolby Vision Scan
            const displayTitle = primaryVideoStream.DisplayTitle || '';
            const videoRangeType = primaryVideoStream.VideoRangeType || '';
            const dolbyVisionRegex = /dolby\s*vision|dv/i;
            const dolbyVisionMatchTitle = displayTitle.match(dolbyVisionRegex);
            const dolbyVisionMatchRange = videoRangeType.match(dolbyVisionRegex);
            if (dolbyVisionMatchTitle || dolbyVisionMatchRange) {
                hdrTag = 'Dolby Vision';
                qualities.add(hdrTag);
            } else {
                // Priority 2: HDR Fallback
                const hdr10PlusRegex = /hdr10plus/i;
                const hdr10Regex = /hdr10/i;
                const hdrRegex = /\bhdr\b/i;

                const hdr10PlusMatchTitle = displayTitle.match(hdr10PlusRegex);
                const hdr10PlusMatchRange = videoRangeType.match(hdr10PlusRegex);


                if (hdr10PlusMatchTitle || hdr10PlusMatchRange) {
                    hdrTag = 'HDR10+';
                    qualities.add(hdrTag);
                } else {
                    const hdr10MatchTitle = displayTitle.match(hdr10Regex);
                    const hdr10MatchRange = videoRangeType.match(hdr10Regex);

                    if (hdr10MatchTitle || hdr10MatchRange) {
                        hdrTag = 'HDR10';
                        qualities.add(hdrTag);
                    } else {
                        const hdrMatchTitle = displayTitle.match(hdrRegex);
                        const hdrMatchRange = videoRangeType.match(hdrRegex);

                        if (hdrMatchTitle || hdrMatchRange) {
                            hdrTag = 'HDR';
                            qualities.add(hdrTag);
                        }
                    }
                }
            }
        }
    }

    function addAudioTag(qualities, audioStreams) {
        // --- AUDIO LOGIC ---
        let audioTag = null;

        for (let i = 0; i < audioStreams.length; i++) {
            const stream = audioStreams[i];

            // Priority 1: DisplayTitle Scan
            const displayTitle = stream.DisplayTitle || '';

            const atmosRegex = /atmos/i;
            const truehd = /truehd/i;
            const dtsxRegex = /dts-x/i;
            const dtsRegex = /\bdts\b/i;
            const ddpRegex = /dolby\s*digital\+/i;

            const atmosMatch = displayTitle.match(atmosRegex);
            const truehdMatch = displayTitle.match(truehd);
            const dtsxMatch = displayTitle.match(dtsxRegex);
            const dtsMatch = displayTitle.match(dtsRegex);
            const ddpMatch = displayTitle.match(ddpRegex);

            if (atmosMatch) {
                audioTag = 'ATMOS';
                break; // Stop all further audio checks
            } else if (truehdMatch) {
                audioTag = 'TRUEHD';
                break;
            } else if (dtsxMatch) {
                audioTag = 'DTS-X';
                break;
            } else if (dtsMatch) {
                audioTag = 'DTS';
                break;
            } else if (ddpMatch) {
                audioTag = 'Dolby Digital+';
                break;
            }
        }

        if (!audioTag) {

            // Priority 2: Technical Metadata Fallback
            for (let i = 0; i < audioStreams.length; i++) {
                const stream = audioStreams[i];
                const codec = (stream.Codec || '').toLowerCase();
                const profile = (stream.Profile || '').toLowerCase();

                if (codec.includes('truehd') || profile.includes('truehd')) {
                    if (codec.includes('atmos') || profile.includes('atmos')) {
                        audioTag = 'ATMOS';
                    } else {
                        audioTag = 'TRUEHD';
                    }
                    break;
                } else if (codec.includes('dts')) {
                    if (codec.includes('x') || profile.includes('x')) {
                        audioTag = 'DTS-X';
                    } else {
                        audioTag = 'DTS';
                    }
                    break;
                } else if (codec.includes('eac3') || codec.includes('ddp')) {
                    audioTag = 'Dolby Digital+';
                    break;
                }
            }
        }

        const channelTag = getChannelTag(audioStreams);

        // Append channel layout to codec tag instead of creating a separate channel tag.
        if (audioTag) {
            if (channelTag && !audioTag.includes(channelTag)) {
                audioTag = `${audioTag} ${channelTag}`;
            }
            qualities.add(audioTag);
        } else if (channelTag === '7.1' || channelTag === '5.1') {
            // Preserve previous fallback behavior when no codec tag is detected.
            qualities.add(channelTag);
        }
    }

    function add3dTag(qualities, mediaSources) {
        // --- 3D VIDEO LOGIC ---
        if (mediaSources) {
            for (const source of mediaSources) {
                if (source.Path) {
                    const path = source.Path.toLowerCase();
                    const has3D = path.includes('3d');
                    const has3DFormat = /hsbs|fsbs|htab|ftab|mvc/.test(path);

                    if (has3D && has3DFormat) {
                        qualities.add('3D');
                        break; // Found 3D, no need to check other sources
                    }
                }
            }
        }
    }

    function addMediaStubTag(qualities, mediaSources, itemData) {
        // --- MEDIA STUB TAG LOGIC ---
        // Detect media stubs (.disc files) for BluRay, DVD, or generic Physical media
        const stubSignals = [];
        if (itemData) {
            stubSignals.push(
                itemData.Name || '',
                itemData.Path || ''
            );
        }
        if (Array.isArray(mediaSources)) {
            mediaSources.forEach((source) => {
                stubSignals.push(source?.Path || '', source?.Name || '');
            });
        }

        const stubContext = stubSignals.filter(Boolean).join(' | ').toLowerCase();

        // Check for .disc extension (media stub indicator)
        if (stubContext.includes('.disc')) {
            // Parse filename/path for specific media type patterns
            const blurayRegex = /bluray|blu-ray|bdrip|bd-rip|bdremux/;
            const hddvdRegex = /hddvd|hd-dvd|hd dvd/;
            const dvdRegex = /dvd|dvdrip|dvd-rip|dvdremux/;
            const vhsRegex = /vhs/;
            const hdtvRegex = /hdtv/;

            if (blurayRegex.test(stubContext)) {
                qualities.add('BluRay');
            } else if (hddvdRegex.test(stubContext)) {
                qualities.add('HD DVD');
            } else if (dvdRegex.test(stubContext)) {
                qualities.add('DVD');
            } else if (vhsRegex.test(stubContext)) {
                qualities.add('VHS');
            } else if (hdtvRegex.test(stubContext)) {
                qualities.add('HDTV');
            } else {
                qualities.add('Physical');
            }
        }
    }

    JE.tags = JE.tags || {};
    JE.tags.qualityAnalysis = { getEnhancedQuality };
})(window.JellyfinEnhanced);
