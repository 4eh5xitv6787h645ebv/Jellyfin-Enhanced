using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    // MemoryStream that throws CapacityExceededException once total written
    // bytes pass a hard cap. Used by PosterTagMiddleware to prevent a
    // hostile or oversized upstream response from filling RAM. Failures
    // bubble out of Write* so the middleware can bypass cleanly.
    internal sealed class BoundedMemoryStream : MemoryStream
    {
        public sealed class CapacityExceededException : IOException
        {
            public CapacityExceededException(long cap) : base($"BoundedMemoryStream exceeded {cap} byte cap") { }
        }

        private readonly long _cap;

        public BoundedMemoryStream(long cap)
        {
            _cap = cap;
        }

        public override void Write(byte[] buffer, int offset, int count)
        {
            EnsureRoom(count);
            base.Write(buffer, offset, count);
        }

        public override void Write(ReadOnlySpan<byte> buffer)
        {
            EnsureRoom(buffer.Length);
            base.Write(buffer);
        }

        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        {
            EnsureRoom(count);
            return base.WriteAsync(buffer, offset, count, cancellationToken);
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
        {
            EnsureRoom(buffer.Length);
            return base.WriteAsync(buffer, cancellationToken);
        }

        public override void WriteByte(byte value)
        {
            EnsureRoom(1);
            base.WriteByte(value);
        }

        private void EnsureRoom(int additional)
        {
            if (Length + additional > _cap)
            {
                throw new CapacityExceededException(_cap);
            }
        }
    }
}
