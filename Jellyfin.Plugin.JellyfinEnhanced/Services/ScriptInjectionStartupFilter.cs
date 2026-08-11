using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Injects the Jellyfin Enhanced client &lt;script&gt; tags into jellyfin-web's
    /// index.html at request time, via ASP.NET middleware registered through
    /// <see cref="Microsoft.AspNetCore.Hosting.IStartupFilter"/>.
    ///
    /// Jellyfin 12 serves index.html as a plain static file with no native
    /// script-injection hook, so the plugin injects its own script by running
    /// middleware ahead of the static-file handler. This keeps script injection
    /// self-contained and works on both Jellyfin 10.11 and 12, without writing to
    /// the web folder (the legacy on-disk rewrite needs a writable web folder /
    /// root container and is wiped on every jellyfin-web update).
    ///
    /// The filter is deliberately defensive and convergent:
    ///   - only ever touches the web index.html response;
    ///   - removes any stale Jellyfin Enhanced-owned response tags and inserts exactly
    ///     one current bootstrap+loader pair;
    ///   - repeated rewrites are idempotent (a stale ?v= tag is replaced, not kept);
    ///   - on any error it serves the original response unchanged, never throwing
    ///     into the pipeline;
    ///   - can be disabled via the DisableScriptInjectionMiddleware config flag.
    /// </summary>
    public class ScriptInjectionStartupFilter : IStartupFilter
    {
        // PERF: index.html is a hot host path. A warm request performs one
        // validator-only static-file revalidation plus O(1) bounded cache work; it
        // does not buffer or rewrite the shell again. Four fixed admission stripes
        // single-flight each representation key and bound aggregate cold/source-change
        // work. Encoded buffering and decoded/re-encoded transforms stop at 2 MiB;
        // larger or untransformable responses switch to the original host bytes in the
        // same downstream pass. The singleton retains at most 12 representations /
        // 8 MiB, covering the three route spellings and finite identity/gzip/br
        // negotiation without scaling with users or requests.
        internal const int MaxCachedRepresentations = 12;
        internal const int MaxCachedBodyBytes = 8 * 1024 * 1024;
        internal const int MaxCacheableRepresentationBytes = 2 * 1024 * 1024;
        internal const int MaxTransformBodyBytes = MaxCacheableRepresentationBytes;
        internal const int RepresentationGateCount = 4;

        private readonly Logger _logger;
        private readonly Func<string> _scriptTagProvider;
        private readonly object _cacheLock = new object();
        private readonly Dictionary<string, CachedRepresentation> _cache = new Dictionary<string, CachedRepresentation>(StringComparer.Ordinal);
        private readonly LinkedList<string> _leastRecentlyUsed = new LinkedList<string>();
        private readonly SemaphoreSlim[] _representationGates = Enumerable
            .Range(0, RepresentationGateCount)
            .Select(_ => new SemaphoreSlim(1, 1))
            .ToArray();
        private int _cachedBodyBytes;
        private int _loggedOnce;

        /// <summary>
        /// DI entry point. The registration in PluginServiceRegistrator resolves this
        /// filter as a singleton with the plugin's shared <see cref="Logger"/>; the
        /// script tags come from the plugin instance so this file never duplicates the
        /// tag contract.
        /// </summary>
        public ScriptInjectionStartupFilter(Logger logger)
            : this(logger, () => JellyfinEnhanced.Instance!.BuildScriptTag())
        {
        }

        /// <summary>
        /// Test-friendly overload: the tag source is injectable so the caching,
        /// precondition and rewrite behaviour can be exercised without a live plugin
        /// instance.
        /// </summary>
        internal ScriptInjectionStartupFilter(Logger logger, Func<string> scriptTagProvider)
        {
            _logger = logger;
            _scriptTagProvider = scriptTagProvider;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                // Registered before the rest of the pipeline (next(app)) so this runs
                // outermost and captures the representation selected by Jellyfin's
                // compression/static-file middleware.
                app.Use(InvokeAsync);
                next(app);
            };
        }

        private async Task InvokeAsync(HttpContext context, Func<Task> nextMw)
        {
            if (!IsIndexRequest(context.Request.Path.Value))
            {
                await nextMw().ConfigureAwait(false);
                return;
            }

            var isHead = HttpMethods.IsHead(context.Request.Method);
            if (!HttpMethods.IsGet(context.Request.Method) && !isHead)
            {
                await nextMw().ConfigureAwait(false);
                return;
            }

            // JE has no config provider abstraction: read the live plugin
            // configuration directly. A missing instance (very early startup) or the
            // kill switch both mean "do nothing", never "fail the request".
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || config.DisableScriptInjectionMiddleware)
            {
                await nextMw().ConfigureAwait(false);
                return;
            }

            string scriptTags;
            try
            {
                scriptTags = _scriptTagProvider();
            }
            catch (Exception ex)
            {
                // The source response has not been claimed yet, so the host can still
                // serve its untouched shell if plugin state is unexpectedly unavailable.
                _logger.Warning($"Script injection middleware error (serving original HTML): {ex.Message}");
                await nextMw().ConfigureAwait(false);
                return;
            }

            var cacheKey = CreateCacheKey(
                context.Request.Path.Value ?? string.Empty,
                context.Request.Headers["Accept-Encoding"],
                scriptTags);
            var representationGate = _representationGates[cacheKey[0] % RepresentationGateCount];
            await representationGate.WaitAsync(context.RequestAborted).ConfigureAwait(false);
            var ownsRepresentationGate = true;
            var cached = GetCached(cacheKey);

            // A cold HEAD passes straight through, exactly as JE always handled HEAD
            // before this middleware learned to intercept it: the transform needs the
            // body bytes and HEAD never carries them, so there is no way to produce
            // transformed metadata without issuing our own internal GET. Serving the
            // host's native metadata (source ETag/Last-Modified/Content-Length) keeps
            // uptime monitors and proxy health checks working; a warm HEAD below
            // still answers with the transformed representation's metadata.
            if (isHead && cached == null)
            {
                ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                await nextMw().ConfigureAwait(false);
                return;
            }

            try
            {
                var requestHeaders = context.Request.Headers;
                var originalRange = requestHeaders["Range"];
                var originalIfRange = requestHeaders["If-Range"];
                var clientIfMatch = requestHeaders["If-Match"];
                var clientIfNoneMatch = requestHeaders["If-None-Match"];
                var originalIfUnmodifiedSince = requestHeaders["If-Unmodified-Since"];
                var originalIfModifiedSince = requestHeaders["If-Modified-Since"];
                var hadRange = requestHeaders.ContainsKey("Range");
                var hadIfRange = requestHeaders.ContainsKey("If-Range");
                var hadIfMatch = requestHeaders.ContainsKey("If-Match");
                var hadIfNoneMatch = requestHeaders.ContainsKey("If-None-Match");
                var hadIfUnmodifiedSince = requestHeaders.ContainsKey("If-Unmodified-Since");
                var hadIfModifiedSince = requestHeaders.ContainsKey("If-Modified-Since");

                // Accept-Encoding deliberately stays untouched. Jellyfin's own response
                // compression middleware therefore selects the representation that lands
                // in our bounded response stream; after injection we restore that same
                // encoding and cache the rewritten representation.
                // A byte range of the source index is not a byte range of the rewritten
                // representation. Ignore Range/If-Range for this shell and return the
                // complete injected representation, preventing even a full-file 206 from
                // exposing an uninjected page. Jellyfin's validators likewise describe
                // the source index whereas browsers know only the rewritten representation.
                // Translate a warm entry back to source validators for a bodyless host
                // revalidation; a cold request suppresses client validators because they
                // cannot validate the source.
                requestHeaders.Remove("Range");
                requestHeaders.Remove("If-Range");
                requestHeaders.Remove("If-Match");
                requestHeaders.Remove("If-Unmodified-Since");
                if (cached != null)
                {
                    SetOrRemove(requestHeaders, "If-None-Match", cached.SourceETag);
                    SetOrRemove(requestHeaders, "If-Modified-Since", cached.SourceLastModified);
                }
                else
                {
                    requestHeaders.Remove("If-None-Match");
                    requestHeaders.Remove("If-Modified-Since");
                }

                var originalBody = context.Response.Body;
                using var buffer = new BoundedPassthroughStream(
                    originalBody,
                    MaxTransformBodyBytes,
                    () => PrepareSourceFallback(
                        context,
                        clientIfMatch,
                        clientIfNoneMatch,
                        originalIfUnmodifiedSince,
                        originalIfModifiedSince));
                context.Response.Body = buffer;
                try
                {
                    await nextMw().ConfigureAwait(false);
                }
                finally
                {
                    // Everything this middleware borrowed from the request is handed
                    // back exactly as found, whether the downstream pass succeeded or
                    // threw: later middleware/logging must never observe our edits.
                    // The request method is deliberately never rewritten (a cold HEAD
                    // passes through above instead), so there is nothing to restore.
                    context.Response.Body = originalBody;
                    RestoreHeader(requestHeaders, "Range", originalRange, hadRange);
                    RestoreHeader(requestHeaders, "If-Range", originalIfRange, hadIfRange);
                    RestoreHeader(requestHeaders, "If-Match", clientIfMatch, hadIfMatch);
                    RestoreHeader(requestHeaders, "If-None-Match", clientIfNoneMatch, hadIfNoneMatch);
                    RestoreHeader(
                        requestHeaders,
                        "If-Unmodified-Since",
                        originalIfUnmodifiedSince,
                        hadIfUnmodifiedSince);
                    RestoreHeader(
                        requestHeaders,
                        "If-Modified-Since",
                        originalIfModifiedSince,
                        hadIfModifiedSince);
                }

                // The bounded stream already committed or discarded the original source
                // response. In either case Jellyfin's downstream pipeline ran exactly once.
                if (buffer.IsPassthrough)
                {
                    ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                    return;
                }

                // A canceled static-file send can be swallowed by ASP.NET Core.
                // Cancellation must terminate cache admission and must never trigger a
                // second response producer.
                if (context.RequestAborted.IsCancellationRequested)
                {
                    return;
                }

                var encodedSource = buffer.ToArray();

                if (context.Response.StatusCode == StatusCodes.Status304NotModified && cached != null)
                {
                    // The host confirmed the source index is unchanged, so the cached
                    // injected representation is still current. The client's own
                    // validators are answered against the transformed ETag it knows.
                    ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                    await WriteRepresentationAsync(
                        context,
                        cached,
                        EvaluateClientPreconditions(clientIfMatch, clientIfNoneMatch, cached),
                        writeBody: !isHead,
                        originalBody).ConfigureAwait(false);
                    return;
                }

                if (isHead)
                {
                    if (context.Response.StatusCode != StatusCodes.Status200OK)
                    {
                        ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                        await WriteSourceFallbackAsync(
                            context,
                            buffer,
                            clientIfMatch,
                            clientIfNoneMatch,
                            originalIfUnmodifiedSince,
                            originalIfModifiedSince,
                            originalBody).ConfigureAwait(false);
                        return;
                    }

                    // HEAD never downloads the shell just to derive a transformed ETag.
                    // A cold HEAD already passed through untouched, and a warm unchanged
                    // source used the cached 304 path above — so reaching here means the
                    // source CHANGED under a warm entry. The stale transformed metadata
                    // is unsafe: evict the old entry and omit source validators/length
                    // rather than letting caches merge source metadata into a later
                    // injected GET.
                    RemoveCached(cacheKey);
                    context.Response.Headers.Remove("ETag");
                    context.Response.Headers.Remove("Last-Modified");
                    context.Response.Headers.Remove("Accept-Ranges");
                    context.Response.Headers.Remove("Content-Range");
                    context.Response.ContentLength = null;
                    context.Response.StatusCode = EvaluateMetadataOnlyHeadPrecondition(
                        clientIfMatch,
                        clientIfNoneMatch);
                    return;
                }

                var isHtml = context.Response.StatusCode == StatusCodes.Status200OK
                    && (context.Response.ContentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) ?? false);

                if (!isHtml)
                {
                    ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                    await WriteSourceFallbackAsync(
                        context,
                        buffer,
                        clientIfMatch,
                        clientIfNoneMatch,
                        originalIfUnmodifiedSince,
                        originalIfModifiedSince,
                        originalBody).ConfigureAwait(false);
                    return;
                }

                CachedRepresentation? representation = null;
                try
                {
                    if (!TryDecode(encodedSource, context.Response.Headers["Content-Encoding"], out var decodedSource))
                    {
                        // A future host compression provider or a representation whose
                        // decoded size exceeds the cap cannot be safely rewritten.
                    }
                    else
                    {
                        string html;
                        using (var decoded = new MemoryStream(decodedSource, writable: false))
                        using (var reader = new StreamReader(decoded, Encoding.UTF8, true, 1024, leaveOpen: false))
                        {
                            html = await reader.ReadToEndAsync().ConfigureAwait(false);
                        }

                        // A missing closing body is also the signature of the partial
                        // SendFileAsync result seen on disconnect. Never cache it.
                        if (html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            html = ReplaceOwnedScriptTags(html, scriptTags);

                            if (Interlocked.Exchange(ref _loggedOnce, 1) == 0)
                            {
                                _logger.Info("Jellyfin Enhanced: injected the client script via request-time middleware (IStartupFilter).");
                            }

                            if (Encoding.UTF8.GetByteCount(html) <= MaxTransformBodyBytes)
                            {
                                var rewrittenUtf8 = Encoding.UTF8.GetBytes(html);
                                if (TryEncode(
                                    rewrittenUtf8,
                                    context.Response.Headers["Content-Encoding"],
                                    out var rewrittenBody))
                                {
                                    // Cache-Control and Vary are inherited from the source
                                    // verbatim: the host, not this plugin, owns the shell's
                                    // freshness and negotiation policy.
                                    representation = new CachedRepresentation(
                                        cacheKey,
                                        rewrittenBody,
                                        CreateETag(rewrittenBody),
                                        context.Response.Headers["ETag"].ToString(),
                                        context.Response.Headers["Last-Modified"].ToString(),
                                        "text/html;charset=utf-8",
                                        context.Response.Headers["Content-Encoding"].ToString(),
                                        context.Response.Headers["Cache-Control"].ToString(),
                                        context.Response.Headers["Vary"].ToString());
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Never break index.html — the original representation and all of
                    // its host-selected headers are still intact.
                    _logger.Warning($"Script injection middleware error (serving original HTML): {ex.Message}");
                }

                if (representation == null)
                {
                    // Commit the buffered source representation from this same downstream
                    // pass. Source preconditions are evaluated before any bytes reach the
                    // transport because the host saw transformed-representation validators.
                    ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                    await WriteSourceFallbackAsync(
                        context,
                        buffer,
                        clientIfMatch,
                        clientIfNoneMatch,
                        originalIfUnmodifiedSince,
                        originalIfModifiedSince,
                        originalBody).ConfigureAwait(false);
                    return;
                }

                if (context.RequestAborted.IsCancellationRequested)
                {
                    return;
                }

                PutCached(representation);
                ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
                await WriteRepresentationAsync(
                    context,
                    representation,
                    EvaluateClientPreconditions(clientIfMatch, clientIfNoneMatch, representation),
                    writeBody: !isHead,
                    originalBody).ConfigureAwait(false);
            }
            finally
            {
                ReleaseRepresentationGate(ref ownsRepresentationGate, representationGate);
            }
        }

        // The cache key covers everything that can change the produced bytes: the
        // requested spelling of the shell path, the encoding the host will pick for
        // this Accept-Encoding, and the exact script tags (which carry the plugin
        // version / build id, so a plugin upgrade never reuses an old entry).
        // The path is lower-cased first: IsIndexRequest admits case-insensitive
        // spellings (/web, /Web, /WEB/index.html ...) that all serve the identical
        // document, and keying them verbatim would let a client mint dozens of
        // distinct entries for one representation and churn the 12-entry LRU.
        private static string CreateCacheKey(string path, StringValues acceptEncoding, string scriptTags)
        {
            var material = Encoding.UTF8.GetBytes(
                path.ToLowerInvariant() + "\0" + SelectResponseEncoding(acceptEncoding) + "\0" + scriptTags);
            return Convert.ToHexString(SHA256.HashData(material));
        }

        // Strong validator for the transformed representation, derived from the exact
        // encoded bytes we are about to send.
        private static string CreateETag(byte[] body) =>
            "\"je-" + Convert.ToHexString(SHA256.HashData(body)).ToLowerInvariant() + "\"";

        private CachedRepresentation? GetCached(string key)
        {
            lock (_cacheLock)
            {
                if (!_cache.TryGetValue(key, out var cached))
                {
                    return null;
                }

                _leastRecentlyUsed.Remove(key);
                _leastRecentlyUsed.AddLast(key);
                return cached;
            }
        }

        private void RemoveCached(string key)
        {
            lock (_cacheLock)
            {
                if (_cache.Remove(key, out var cached))
                {
                    _cachedBodyBytes -= cached.Body.Length;
                    _leastRecentlyUsed.Remove(key);
                }
            }
        }

        private void PutCached(CachedRepresentation representation)
        {
            // Without a source validator, a later request cannot prove that the host
            // file is unchanged. Serve this request correctly but do not retain bytes
            // that could become stale.
            if (representation.Body.Length > MaxCacheableRepresentationBytes
                || (string.IsNullOrEmpty(representation.SourceETag)
                    && string.IsNullOrEmpty(representation.SourceLastModified)))
            {
                return;
            }

            lock (_cacheLock)
            {
                if (_cache.Remove(representation.Key, out var replaced))
                {
                    _cachedBodyBytes -= replaced.Body.Length;
                    _leastRecentlyUsed.Remove(representation.Key);
                }

                while (_cache.Count >= MaxCachedRepresentations
                    || (_cachedBodyBytes + representation.Body.Length > MaxCachedBodyBytes
                        && _leastRecentlyUsed.First != null))
                {
                    var oldestKey = _leastRecentlyUsed.First!.Value;
                    _leastRecentlyUsed.RemoveFirst();
                    if (_cache.Remove(oldestKey, out var oldest))
                    {
                        _cachedBodyBytes -= oldest.Body.Length;
                    }
                }

                _cache[representation.Key] = representation;
                _leastRecentlyUsed.AddLast(representation.Key);
                _cachedBodyBytes += representation.Body.Length;
            }
        }

        private static async Task WriteRepresentationAsync(
            HttpContext context,
            CachedRepresentation representation,
            ClientPrecondition precondition,
            bool writeBody,
            Stream responseBody)
        {
            context.Response.StatusCode = precondition switch
            {
                ClientPrecondition.NotModified => StatusCodes.Status304NotModified,
                ClientPrecondition.Failed => StatusCodes.Status412PreconditionFailed,
                _ => StatusCodes.Status200OK,
            };
            SetOrRemove(context.Response.Headers, "Cache-Control", representation.CacheControl);
            SetOrRemove(context.Response.Headers, "Vary", representation.Vary);
            // The source timestamp cannot describe the injected representation:
            // script generation can change while index.html does not. Publishing it
            // would let an IMS-only client validate a stale generation. The strong,
            // body-derived ETag is the transformed representation's validator.
            context.Response.Headers.Remove("Last-Modified");
            context.Response.Headers["ETag"] = representation.ETag;
            context.Response.Headers.Remove("Accept-Ranges");
            context.Response.Headers.Remove("Content-Range");

            if (precondition != ClientPrecondition.ShouldProcess)
            {
                // Bodyless responses must not advertise a content coding for bytes
                // that are never written: a strict client that pipes anything
                // labelled `Content-Encoding: br` through a decoder would see a
                // truncated stream. Mirror the host's native shape — a 304 keeps
                // Content-Type/ETag but no Content-Encoding; a 412 carries no
                // entity metadata at all (same rule PrepareSourceFallback applies
                // when reproducing the host's native 412).
                context.Response.Headers.Remove("Content-Encoding");
                if (precondition == ClientPrecondition.Failed)
                {
                    context.Response.ContentType = null;
                    context.Response.Headers.Remove("ETag");
                }
                else
                {
                    context.Response.ContentType = representation.ContentType;
                }

                context.Response.ContentLength = null;
                return;
            }

            context.Response.ContentType = representation.ContentType;
            SetOrRemove(context.Response.Headers, "Content-Encoding", representation.ContentEncoding);

            context.Response.ContentLength = representation.Body.Length;
            if (writeBody)
            {
                await responseBody.WriteAsync(
                    representation.Body.AsMemory(),
                    context.RequestAborted).ConfigureAwait(false);
            }
        }

        private static async Task WriteSourceFallbackAsync(
            HttpContext context,
            BoundedPassthroughStream bufferedSource,
            StringValues ifMatch,
            StringValues ifNoneMatch,
            StringValues ifUnmodifiedSince,
            StringValues ifModifiedSince,
            Stream responseBody)
        {
            if (!PrepareSourceFallback(
                context,
                ifMatch,
                ifNoneMatch,
                ifUnmodifiedSince,
                ifModifiedSince))
            {
                return;
            }

            await bufferedSource.CopyBufferedToAsync(
                responseBody,
                context.RequestAborted).ConfigureAwait(false);
        }

        // Decides whether the buffered source bytes should still be written, and when
        // they should not, reshapes the response into the status the host itself would
        // have produced for the client's original (suppressed) preconditions.
        // Returns true when the caller must copy the buffered body out.
        private static bool PrepareSourceFallback(
            HttpContext context,
            StringValues ifMatch,
            StringValues ifNoneMatch,
            StringValues ifUnmodifiedSince,
            StringValues ifModifiedSince)
        {
            if (context.RequestAborted.IsCancellationRequested)
            {
                return false;
            }

            if (context.Response.StatusCode != StatusCodes.Status200OK)
            {
                return !HttpMethods.IsHead(context.Request.Method);
            }

            var sourceETag = context.Response.Headers["ETag"].ToString();
            var sourceLastModified = context.Response.Headers["Last-Modified"].ToString();
            var statusCode = EvaluateSourcePreconditions(
                ifMatch,
                ifNoneMatch,
                ifUnmodifiedSince,
                ifModifiedSince,
                sourceETag,
                sourceLastModified);
            if (statusCode == StatusCodes.Status200OK)
            {
                return !HttpMethods.IsHead(context.Request.Method);
            }

            context.Response.StatusCode = statusCode;
            context.Response.ContentLength = null;
            context.Response.Headers.Remove("Content-Encoding");
            context.Response.Headers.Remove("Content-Range");
            context.Response.Headers.Remove("Vary");
            if (statusCode == StatusCodes.Status412PreconditionFailed)
            {
                // Static Files applies entity metadata only to responses below 400.
                // The downstream 200 collected for same-pass fallback already added
                // these fields, so remove them when reproducing its native 412.
                context.Response.ContentType = null;
                context.Response.Headers.Remove("ETag");
                context.Response.Headers.Remove("Last-Modified");
                context.Response.Headers.Remove("Accept-Ranges");
            }

            return false;
        }

        private static int EvaluateSourcePreconditions(
            StringValues ifMatch,
            StringValues ifNoneMatch,
            StringValues ifUnmodifiedSince,
            StringValues ifModifiedSince,
            string sourceETag,
            string sourceLastModified)
        {
            var sourceTag = EntityTagHeaderValue.TryParse(
                new StringSegment(sourceETag),
                out var parsedSourceTag)
                ? parsedSourceTag
                : null;
            var ifMatchState = SourcePrecondition.Unspecified;
            var parsedIfMatch = ParseEntityTags(ifMatch);
            if (parsedIfMatch.Count > 0)
            {
                ifMatchState = parsedIfMatch.Any(candidate =>
                    candidate.Equals(EntityTagHeaderValue.Any)
                    || candidate.Compare(sourceTag, useStrongComparison: true))
                    ? SourcePrecondition.ShouldProcess
                    : SourcePrecondition.Failed;
            }

            var ifNoneMatchState = SourcePrecondition.Unspecified;
            var parsedIfNoneMatch = ParseEntityTags(ifNoneMatch);
            if (parsedIfNoneMatch.Count > 0)
            {
                // RFC 9110 §13.1.2: If-None-Match uses the WEAK comparison function
                // (If-Match above correctly stays strong). StaticFileContext's
                // ComputeIfNoneMatch does the same, so a validator weakened by an
                // intermediary (nginx gzip marks ETags W/) still revalidates to a
                // 304 on the source-fallback path instead of a full-body 200.
                ifNoneMatchState = parsedIfNoneMatch.Any(candidate =>
                    candidate.Equals(EntityTagHeaderValue.Any)
                    || candidate.Compare(sourceTag, useStrongComparison: false))
                    ? SourcePrecondition.NotModified
                    : SourcePrecondition.ShouldProcess;
            }

            var now = DateTimeOffset.UtcNow;
            var ifModifiedSinceState = SourcePrecondition.Unspecified;
            var ifUnmodifiedSinceState = SourcePrecondition.Unspecified;
            if (TryParseHttpDate(sourceLastModified, out var lastModified))
            {
                if (TryParseHttpDate(ifModifiedSince, out var modifiedSince)
                    && modifiedSince <= now)
                {
                    ifModifiedSinceState = modifiedSince < lastModified
                        ? SourcePrecondition.ShouldProcess
                        : SourcePrecondition.NotModified;
                }

                if (TryParseHttpDate(ifUnmodifiedSince, out var unmodifiedSince)
                    && unmodifiedSince <= now)
                {
                    ifUnmodifiedSinceState = unmodifiedSince >= lastModified
                        ? SourcePrecondition.ShouldProcess
                        : SourcePrecondition.Failed;
                }
            }

            var state = new[]
            {
                ifMatchState,
                ifNoneMatchState,
                ifModifiedSinceState,
                ifUnmodifiedSinceState,
            }.Max();
            return state switch
            {
                SourcePrecondition.NotModified => StatusCodes.Status304NotModified,
                SourcePrecondition.Failed => StatusCodes.Status412PreconditionFailed,
                _ => StatusCodes.Status200OK,
            };
        }

        private static bool TryParseHttpDate(StringValues value, out DateTimeOffset parsed) =>
            HeaderUtilities.TryParseDate(new StringSegment(value.ToString()), out parsed);

        private static bool TryParseHttpDate(string value, out DateTimeOffset parsed) =>
            HeaderUtilities.TryParseDate(new StringSegment(value), out parsed);

        // The client only ever saw the transformed representation, so its conditional
        // headers are evaluated against the transformed ETag — never the source's.
        private static ClientPrecondition EvaluateClientPreconditions(
            StringValues ifMatch,
            StringValues ifNoneMatch,
            CachedRepresentation representation)
        {
            var parsedIfMatch = ParseEntityTags(ifMatch);
            if (parsedIfMatch.Count > 0
                && !EntityTagSatisfied(
                    parsedIfMatch,
                    representation.ETag,
                    useStrongComparison: true))
            {
                return ClientPrecondition.Failed;
            }

            var parsedIfNoneMatch = ParseEntityTags(ifNoneMatch);
            if (parsedIfNoneMatch.Count > 0)
            {
                return EntityTagSatisfied(
                    parsedIfNoneMatch,
                    representation.ETag,
                    useStrongComparison: false)
                    ? ClientPrecondition.NotModified
                    : ClientPrecondition.ShouldProcess;
            }

            return ClientPrecondition.ShouldProcess;
        }

        // HEAD without a known transformed ETag can only honour wildcard conditions:
        // any concrete entity tag would have to be compared against a validator we
        // deliberately refused to compute (that would mean buffering the whole body).
        private static int EvaluateMetadataOnlyHeadPrecondition(
            StringValues ifMatch,
            StringValues ifNoneMatch)
        {
            var parsedIfMatch = ParseEntityTags(ifMatch);
            if (parsedIfMatch.Count > 0
                && !parsedIfMatch.Any(candidate => candidate.Equals(EntityTagHeaderValue.Any)))
            {
                return StatusCodes.Status412PreconditionFailed;
            }

            var parsedIfNoneMatch = ParseEntityTags(ifNoneMatch);
            return parsedIfNoneMatch.Any(candidate => candidate.Equals(EntityTagHeaderValue.Any))
                ? StatusCodes.Status304NotModified
                : StatusCodes.Status200OK;
        }

        private static IList<EntityTagHeaderValue> ParseEntityTags(StringValues header)
        {
            var values = header
                .Where(value => value != null)
                .Select(value => value!)
                .ToArray();
            return EntityTagHeaderValue.TryParseList(values, out var parsed)
                ? parsed
                : Array.Empty<EntityTagHeaderValue>();
        }

        private static bool EntityTagSatisfied(
            IList<EntityTagHeaderValue> candidates,
            string etag,
            bool useStrongComparison)
        {
            if (!EntityTagHeaderValue.TryParse(new StringSegment(etag), out var parsedETag))
            {
                return candidates.Any(candidate => candidate.Equals(EntityTagHeaderValue.Any));
            }

            return candidates.Any(candidate =>
                candidate.Equals(EntityTagHeaderValue.Any)
                || candidate.Compare(parsedETag, useStrongComparison));
        }

        // Content-Encoding is applied left-to-right by the sender, so decoding walks
        // the list in reverse. An unknown coding fails the whole attempt and the
        // caller falls back to the untouched source bytes.
        private static bool TryDecode(byte[] body, StringValues contentEncoding, out byte[] decoded)
        {
            decoded = body;
            var encodings = ParseEncodings(contentEncoding);
            for (var index = encodings.Count - 1; index >= 0; index--)
            {
                if (!TryTransform(decoded, encodings[index], decompress: true, out decoded))
                {
                    return false;
                }
            }

            return true;
        }

        // Re-applies exactly the codings the host chose, so the rewritten body still
        // matches the Content-Encoding header already on the response.
        private static bool TryEncode(byte[] body, StringValues contentEncoding, out byte[] encoded)
        {
            encoded = body;
            foreach (var encoding in ParseEncodings(contentEncoding))
            {
                if (!TryTransform(encoded, encoding, decompress: false, out encoded))
                {
                    return false;
                }
            }

            return true;
        }

        private static List<string> ParseEncodings(StringValues contentEncoding) =>
            contentEncoding
                .SelectMany(value => (value ?? string.Empty).Split(','))
                .Select(value => value.Trim())
                .Where(value => value.Length > 0 && !value.Equals("identity", StringComparison.OrdinalIgnoreCase))
                .ToList();

        private static bool TryTransform(byte[] source, string encoding, bool decompress, out byte[] transformed)
        {
            transformed = source;
            if (!encoding.Equals("gzip", StringComparison.OrdinalIgnoreCase)
                && !encoding.Equals("br", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            using var input = new MemoryStream(source, writable: false);
            using var output = new BoundedMemoryStream(MaxTransformBodyBytes);
            try
            {
                if (decompress)
                {
                    using Stream decoder = encoding.Equals("gzip", StringComparison.OrdinalIgnoreCase)
                        ? new GZipStream(input, CompressionMode.Decompress)
                        : new BrotliStream(input, CompressionMode.Decompress);
                    decoder.CopyTo(output);
                }
                else
                {
                    using (Stream encoder = encoding.Equals("gzip", StringComparison.OrdinalIgnoreCase)
                        ? new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true)
                        : new BrotliStream(output, CompressionLevel.Fastest, leaveOpen: true))
                    {
                        input.CopyTo(encoder);
                    }
                }
            }
            catch (BodyLimitExceededException)
            {
                // A decompression bomb or an oversized shell: refuse the transform
                // rather than allocating without bound.
                return false;
            }

            transformed = output.ToArray();
            return true;
        }

        private static string SelectResponseEncoding(StringValues acceptEncoding)
        {
            var input = acceptEncoding
                .Where(value => value != null)
                .Select(value => value!)
                .ToArray();
            if (!StringWithQualityHeaderValue.TryParseList(input, out var parsedValues))
            {
                return "identity";
            }

            // Mirror ResponseCompressionProvider's finite candidate selection for
            // Jellyfin's default Brotli/Gzip providers: the first duplicate wins,
            // zero-quality candidates are skipped, and a wildcard adds missing
            // providers then terminates parsing. Keying the selected representation
            // prevents both cross-encoding cache reuse and arbitrary quality-value churn.
            var candidates = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            foreach (var parsedValue in parsedValues)
            {
                var coding = parsedValue.Value.ToString();
                var quality = parsedValue.Quality ?? 1.0;
                if (quality < double.Epsilon)
                {
                    continue;
                }

                if (coding.Equals("br", StringComparison.OrdinalIgnoreCase)
                    || coding.Equals("gzip", StringComparison.OrdinalIgnoreCase)
                    || coding.Equals("identity", StringComparison.OrdinalIgnoreCase))
                {
                    candidates.TryAdd(coding, quality);
                    continue;
                }

                if (coding.Equals("*", StringComparison.Ordinal))
                {
                    candidates.TryAdd("br", quality);
                    candidates.TryAdd("gzip", quality);
                    break;
                }
            }

            var selected = "identity";
            var selectedQuality = 0.0;
            foreach (var coding in new[] { "br", "gzip", "identity" })
            {
                if (candidates.TryGetValue(coding, out var quality) && quality > selectedQuality)
                {
                    selected = coding;
                    selectedQuality = quality;
                }
            }

            return selected;
        }

        // Every exit path funnels through this so the stripe is released exactly once,
        // as early as the shared work is done, and never twice from the outer finally.
        private static void ReleaseRepresentationGate(
            ref bool ownsRepresentationGate,
            SemaphoreSlim representationGate)
        {
            if (ownsRepresentationGate)
            {
                ownsRepresentationGate = false;
                representationGate.Release();
            }
        }

        private static void SetOrRemove(IHeaderDictionary headers, string name, string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                headers.Remove(name);
            }
            else
            {
                headers[name] = value;
            }
        }

        private static void RestoreHeader(
            IHeaderDictionary headers,
            string name,
            StringValues originalValue,
            bool existed)
        {
            if (existed)
            {
                headers[name] = originalValue;
            }
            else
            {
                headers.Remove(name);
            }
        }

        private enum ClientPrecondition
        {
            ShouldProcess,
            NotModified,
            Failed,
        }

        // Numeric ordering intentionally matches StaticFileContext.PreconditionState:
        // its native implementation resolves simultaneous fields by taking the
        // highest state.
        private enum SourcePrecondition
        {
            Unspecified,
            NotModified,
            ShouldProcess,
            Failed,
        }

        /// <summary>
        /// MemoryStream that refuses to grow past a fixed limit, so a hostile or
        /// unexpectedly huge compressed payload can't be expanded without bound.
        /// </summary>
        private sealed class BoundedMemoryStream : MemoryStream
        {
            private readonly int _limit;

            public BoundedMemoryStream(int limit)
            {
                _limit = limit;
            }

            public override void Write(byte[] buffer, int offset, int count)
            {
                EnsureCapacityFor(count);
                base.Write(buffer, offset, count);
            }

            public override void Write(ReadOnlySpan<byte> buffer)
            {
                EnsureCapacityFor(buffer.Length);
                base.Write(buffer);
            }

            public override void WriteByte(byte value)
            {
                EnsureCapacityFor(1);
                base.WriteByte(value);
            }

            public override Task WriteAsync(
                byte[] buffer,
                int offset,
                int count,
                CancellationToken cancellationToken)
            {
                cancellationToken.ThrowIfCancellationRequested();
                Write(buffer, offset, count);
                return Task.CompletedTask;
            }

            public override ValueTask WriteAsync(
                ReadOnlyMemory<byte> buffer,
                CancellationToken cancellationToken = default)
            {
                cancellationToken.ThrowIfCancellationRequested();
                Write(buffer.Span);
                return ValueTask.CompletedTask;
            }

            private void EnsureCapacityFor(int count)
            {
                if (count > _limit - Position)
                {
                    throw new BodyLimitExceededException();
                }
            }
        }

        private sealed class BodyLimitExceededException : Exception
        {
        }

        /// <summary>
        /// Buffers the downstream response while it stays under the cap so it can be
        /// rewritten, and transparently switches to writing straight to the real body
        /// once it doesn't. The switch happens inside the single downstream pass, so
        /// an oversized or non-rewritable response is still served correctly and the
        /// pipeline is never run twice.
        /// </summary>
        private sealed class BoundedPassthroughStream : MemoryStream
        {
            public delegate bool PreparePassthroughCallback();

            private readonly Stream _destination;
            private readonly int _limit;
            private readonly PreparePassthroughCallback _preparePassthrough;
            private bool _writeToDestination;

            public BoundedPassthroughStream(
                Stream destination,
                int limit,
                PreparePassthroughCallback preparePassthrough)
            {
                _destination = destination;
                _limit = limit;
                _preparePassthrough = preparePassthrough;
            }

            public bool IsPassthrough { get; private set; }

            public async Task CopyBufferedToAsync(Stream destination, CancellationToken cancellationToken)
            {
                cancellationToken.ThrowIfCancellationRequested();
                Position = 0;
                await CopyToAsync(destination, cancellationToken).ConfigureAwait(false);
            }

            public override void Flush()
            {
                // Deliberately hold flushes while the response remains under the cap.
                // The static app shell is a finite response, and committing a flush
                // would make a later safe rewrite impossible.
                if (IsPassthrough && _writeToDestination)
                {
                    _destination.Flush();
                }
            }

            public override Task FlushAsync(CancellationToken cancellationToken)
            {
                if (IsPassthrough && _writeToDestination)
                {
                    return _destination.FlushAsync(cancellationToken);
                }

                cancellationToken.ThrowIfCancellationRequested();
                return Task.CompletedTask;
            }

            public override void Write(byte[] buffer, int offset, int count)
            {
                if (!IsPassthrough && count <= _limit - Length)
                {
                    base.Write(buffer, offset, count);
                    return;
                }

                EnsurePassthrough();
                if (_writeToDestination)
                {
                    _destination.Write(buffer, offset, count);
                }
            }

            public override void Write(ReadOnlySpan<byte> buffer)
            {
                if (!IsPassthrough && buffer.Length <= _limit - Length)
                {
                    base.Write(buffer);
                    return;
                }

                EnsurePassthrough();
                if (_writeToDestination)
                {
                    _destination.Write(buffer);
                }
            }

            public override void WriteByte(byte value)
            {
                if (!IsPassthrough && Length < _limit)
                {
                    base.WriteByte(value);
                    return;
                }

                EnsurePassthrough();
                if (_writeToDestination)
                {
                    _destination.WriteByte(value);
                }
            }

            public override async Task WriteAsync(
                byte[] buffer,
                int offset,
                int count,
                CancellationToken cancellationToken)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!IsPassthrough && count <= _limit - Length)
                {
                    await base.WriteAsync(
                        buffer.AsMemory(offset, count),
                        cancellationToken).ConfigureAwait(false);
                    return;
                }

                await EnsurePassthroughAsync(cancellationToken).ConfigureAwait(false);
                if (_writeToDestination)
                {
                    await _destination.WriteAsync(
                        buffer.AsMemory(offset, count),
                        cancellationToken).ConfigureAwait(false);
                }
            }

            public override async ValueTask WriteAsync(
                ReadOnlyMemory<byte> buffer,
                CancellationToken cancellationToken = default)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!IsPassthrough && buffer.Length <= _limit - Length)
                {
                    await base.WriteAsync(buffer, cancellationToken).ConfigureAwait(false);
                    return;
                }

                await EnsurePassthroughAsync(cancellationToken).ConfigureAwait(false);
                if (_writeToDestination)
                {
                    await _destination.WriteAsync(buffer, cancellationToken).ConfigureAwait(false);
                }
            }

            private void EnsurePassthrough()
            {
                if (IsPassthrough)
                {
                    return;
                }

                // The callback decides whether the source response should still be
                // sent at all (it may turn the response into a 304/412 instead).
                _writeToDestination = _preparePassthrough();
                IsPassthrough = true;
                if (_writeToDestination)
                {
                    Position = 0;
                    CopyTo(_destination);
                }

                SetLength(0);
            }

            private async Task EnsurePassthroughAsync(CancellationToken cancellationToken)
            {
                if (IsPassthrough)
                {
                    return;
                }

                _writeToDestination = _preparePassthrough();
                IsPassthrough = true;
                if (_writeToDestination)
                {
                    Position = 0;
                    await CopyToAsync(_destination, cancellationToken).ConfigureAwait(false);
                }

                SetLength(0);
            }
        }

        /// <summary>
        /// One fully-formed, ready-to-send injected representation plus the source
        /// validators needed to revalidate it against the host on the next request.
        /// </summary>
        private sealed class CachedRepresentation
        {
            public CachedRepresentation(
                string key,
                byte[] body,
                string etag,
                string sourceETag,
                string sourceLastModified,
                string contentType,
                string contentEncoding,
                string cacheControl,
                string vary)
            {
                Key = key;
                Body = body;
                ETag = etag;
                SourceETag = sourceETag;
                SourceLastModified = sourceLastModified;
                ContentType = contentType;
                ContentEncoding = contentEncoding;
                CacheControl = cacheControl;
                Vary = vary;
            }

            public string Key { get; }

            public byte[] Body { get; }

            public string ETag { get; }

            public string SourceETag { get; }

            public string SourceLastModified { get; }

            public string ContentType { get; }

            public string ContentEncoding { get; }

            public string CacheControl { get; }

            public string Vary { get; }
        }

        /// <summary>
        /// Scrub-then-insert, so injection converges instead of accumulating: every
        /// Jellyfin Enhanced-owned tag already in the document (including one written
        /// by the legacy on-disk rewrite, or one carrying a stale ?v= cache key) is
        /// removed first, then the current tag pair is spliced in before the last
        /// closing body tag. A document with no closing body is left untouched.
        /// </summary>
        internal static string ReplaceOwnedScriptTags(string html, string currentTags)
        {
            var bodyClose = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyClose < 0)
            {
                return html;
            }

            var scrubbed = JellyfinEnhanced.OwnScriptTagRegex().Replace(html, string.Empty);
            bodyClose = scrubbed.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            return scrubbed.Substring(0, bodyClose)
                + currentTags
                + "\n"
                + scrubbed.Substring(bodyClose);
        }

        // Matches the web app shell however it is requested: bare "/web", "/web/"
        // (SPA serve), and explicit "/web/index.html". EndsWith keeps this correct
        // when Jellyfin is hosted under a base-url prefix (e.g. /jellyfin/web/).
        private static bool IsIndexRequest(string? path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            return path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
                || path.Equals("/web", StringComparison.OrdinalIgnoreCase);
        }
    }
}
