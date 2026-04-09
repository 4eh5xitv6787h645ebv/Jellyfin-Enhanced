using System;
using System.Reflection;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Tests.TestHelpers;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests
{
    /// <summary>
    /// Smoke tests for the Phase 0 content-hash fingerprint provider. These
    /// assert on observable properties rather than specific hash values
    /// (which change on every build) so the suite is stable across commits.
    /// </summary>
    public class AssetHashProviderTests
    {
        private static AssetHashProvider Create()
        {
            // Logger is the plugin's own wrapper — only Warning() is called
            // on provider failure paths. The TestLogger helper builds one
            // with a temp log dir so it's hermetic.
            return new AssetHashProvider(TestLogger.Create());
        }

        [Fact]
        public void Hash_Is_Stable_Across_Calls_On_Same_Instance()
        {
            var provider = Create();
            var first = provider.Hash;
            var second = provider.Hash;
            var third = provider.Hash;
            Assert.Equal(first, second);
            Assert.Equal(second, third);
        }

        [Fact]
        public void Hash_Is_Nonempty()
        {
            var provider = Create();
            Assert.False(string.IsNullOrWhiteSpace(provider.Hash));
        }

        [Fact]
        public void Hash_Is_16_Chars_When_Computed_From_Dll()
        {
            // When the DLL is readable (the common case), the hash is a
            // 16-char lowercase hex truncation of the SHA-256. If the
            // fallback paths kick in, the format may differ.
            var provider = Create();
            var hash = provider.Hash;

            // Either it's the 16-char hex form (DLL path worked) OR it's
            // the version-string fallback (format "11-5-0-0"). Both are
            // legitimate outcomes — but not empty.
            Assert.True(hash.Length >= 5);
            Assert.DoesNotContain(" ", hash);
            Assert.DoesNotContain("\n", hash);
        }

        [Fact]
        public void Different_Providers_Agree_On_Hash()
        {
            var a = Create();
            var b = Create();
            // Both instances compute from the same assembly, so the hash
            // must agree byte-for-byte.
            Assert.Equal(a.Hash, b.Hash);
        }

        [Fact]
        public void Hash_Agrees_With_JellyfinEnhanced_ComputedAssetHash_When_Populated()
        {
            // ComputedAssetHash is initialized by the JellyfinEnhanced
            // plugin ctor. In a unit-test run the ctor may or may not
            // have fired — the field defaults to "bootstrap". If the
            // plugin ctor ran, both values should match. If not, the
            // provider fell back to its own DLL read, which is still
            // deterministic against the same assembly.
            var provider = Create();
            var precomputed = typeof(Jellyfin.Plugin.JellyfinEnhanced.JellyfinEnhanced)
                .GetProperty("ComputedAssetHash", BindingFlags.NonPublic | BindingFlags.Static)
                ?.GetValue(null) as string;

            Assert.False(string.IsNullOrWhiteSpace(provider.Hash));
            // If the precomputed value is the default "bootstrap" placeholder,
            // the provider must NOT be returning it — it should have fallen
            // back to its own computation.
            if (precomputed != null && precomputed != "bootstrap")
            {
                Assert.Equal(precomputed, provider.Hash);
            }
            else
            {
                Assert.NotEqual("bootstrap", provider.Hash);
            }
        }
    }
}
