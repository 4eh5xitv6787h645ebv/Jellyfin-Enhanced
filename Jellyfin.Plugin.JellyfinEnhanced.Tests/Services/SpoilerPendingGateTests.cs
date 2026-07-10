using System;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Services
{
    public sealed class SpoilerPendingGateTests
    {
        [Fact]
        public async Task RegisterPending_RetriesWhenConcurrentUnregisterDetachesLookedUpSet()
        {
            var key = "test:" + Guid.NewGuid().ToString("N");
            var oldUser = Guid.NewGuid();
            var newUser = Guid.NewGuid();
            using var lookedUp = new ManualResetEventSlim(false);
            using var mayContinue = new ManualResetEventSlim(false);

            SpoilerSeerrPendingPromoter.RegisterPending(key, oldUser);
            try
            {
                var registering = Task.Run(() =>
                    SpoilerSeerrPendingPromoter.RegisterPendingWithLookupHookForTest(
                        key,
                        newUser,
                        () =>
                        {
                            lookedUp.Set();
                            mayContinue.Wait(TimeSpan.FromSeconds(5));
                        }));

                Assert.True(lookedUp.Wait(TimeSpan.FromSeconds(5)));
                SpoilerSeerrPendingPromoter.UnregisterPending(key, oldUser);
                mayContinue.Set();
                await registering.WaitAsync(TimeSpan.FromSeconds(5));

                Assert.True(SpoilerSeerrPendingPromoter.IsPendingRegisteredForTest(key, newUser));
            }
            finally
            {
                mayContinue.Set();
                SpoilerSeerrPendingPromoter.UnregisterPending(key, oldUser);
                SpoilerSeerrPendingPromoter.UnregisterPending(key, newUser);
            }
        }
    }
}
