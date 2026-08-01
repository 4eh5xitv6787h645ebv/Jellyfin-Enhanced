using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Text;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.TestDoubles
{
    internal sealed record RecordedHttpRequest(
        HttpMethod Method,
        Uri? RequestUri,
        string? ApiUser,
        string? ApiKey,
        string? Body);

    /// <summary>
    /// Creates independent clients over one recording handler. Independent
    /// clients matter because production assigns per-operation timeouts.
    /// </summary>
    internal sealed class RecordingHttpClientFactory : IHttpClientFactory
    {
        private readonly HttpMessageHandler _handler;

        internal RecordingHttpClientFactory(HttpMessageHandler handler)
            => _handler = handler;

        public HttpClient CreateClient(string name)
            => new(_handler, disposeHandler: false);
    }

    internal sealed class RecordingHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;

        internal RecordingHttpMessageHandler(
            Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
            => _responder = responder;

        internal ConcurrentQueue<RecordedHttpRequest> Requests { get; } = new();

        internal int RequestCount => Requests.Count;

        internal static HttpResponseMessage Json(
            string body,
            HttpStatusCode statusCode = HttpStatusCode.OK)
            => new(statusCode)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            var apiUser = request.Headers.TryGetValues("X-Api-User", out var values)
                ? values.SingleOrDefault()
                : null;
            var apiKey = request.Headers.TryGetValues("X-Api-Key", out var apiKeyValues)
                ? apiKeyValues.SingleOrDefault()
                : null;
            Requests.Enqueue(new RecordedHttpRequest(request.Method, request.RequestUri, apiUser, apiKey, body));
            return await _responder(request, cancellationToken).ConfigureAwait(false);
        }
    }
}
