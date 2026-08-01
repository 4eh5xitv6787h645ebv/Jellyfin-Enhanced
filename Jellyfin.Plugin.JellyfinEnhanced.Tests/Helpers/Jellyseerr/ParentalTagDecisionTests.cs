using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Helpers.Jellyseerr
{
    /// <summary>
    /// Pins Jellyfin's blocked-wins and strict-allowlist tag semantics over the
    /// keyword/genre signals available for external Seerr titles.
    /// </summary>
    public sealed class ParentalTagDecisionTests
    {
        private static HashSet<string> Clean(params string[] values)
            => ParentalTagDecision.CleanTags(values);

        [Fact]
        public void EmptyPolicy_AllowsAnySignature()
        {
            Assert.True(ParentalTagDecision.IsAllowed(Clean("zombie"), Clean("horror"), Clean(), Clean()));
            Assert.True(ParentalTagDecision.IsAllowed(Clean(), Clean(), Clean(), Clean()));
        }

        [Fact]
        public void BlockedTag_MatchesKeywordOrGenre()
        {
            Assert.False(ParentalTagDecision.IsAllowed(Clean("zombie"), Clean("comedy"), Clean("zombie"), Clean()));
            Assert.False(ParentalTagDecision.IsAllowed(Clean("friendship"), Clean("horror"), Clean("horror"), Clean()));
            Assert.True(ParentalTagDecision.IsAllowed(Clean("friendship"), Clean("comedy"), Clean("zombie"), Clean()));
        }

        [Fact]
        public void BlockedTag_WinsOverAllowedTag()
            => Assert.False(ParentalTagDecision.IsAllowed(
                Clean("zombie"),
                Clean(),
                Clean("zombie"),
                Clean("zombie")));

        [Fact]
        public void AllowList_RequiresKeywordMatch()
        {
            var allowList = Clean("friendship", "family");

            Assert.True(ParentalTagDecision.IsAllowed(Clean("friendship"), Clean(), Clean(), allowList));
            Assert.False(ParentalTagDecision.IsAllowed(Clean("heist"), Clean(), Clean(), allowList));
            Assert.False(ParentalTagDecision.IsAllowed(Clean(), Clean(), Clean(), allowList));
        }

        [Fact]
        public void Genre_DoesNotSatisfyAllowList()
        {
            Assert.False(ParentalTagDecision.IsAllowed(
                Clean("friendship"),
                Clean("family", "animation"),
                Clean(),
                Clean("family")));
            Assert.True(ParentalTagDecision.IsAllowed(
                Clean("family"),
                Clean(),
                Clean(),
                Clean("family")));
        }

        [Theory]
        [InlineData("Sci-Fi", "sci fi")]
        [InlineData("SCI FI", "sci fi")]
        [InlineData("Pokémon", "pokemon")]
        [InlineData("  graphic   violence ", "graphic violence")]
        [InlineData("Sci-Fi & Fantasy", "sci fi fantasy")]
        public void CleanTags_UsesJellyfinNormalization(string raw, string expected)
            => Assert.Contains(expected, ParentalTagDecision.CleanTags(new[] { raw }));

        [Fact]
        public void CleanTags_DropsEmptyValues()
        {
            Assert.Empty(ParentalTagDecision.CleanTags(new string?[] { null, string.Empty, "   ", "!!!" }));
            Assert.Empty(ParentalTagDecision.CleanTags(null));
        }

        [Fact]
        public void NormalizedPunctuationVariants_Match()
        {
            Assert.False(ParentalTagDecision.IsAllowed(Clean("sci fi"), Clean(), Clean("Sci-Fi"), Clean()));
            Assert.False(ParentalTagDecision.IsAllowed(Clean("Sci-Fi"), Clean(), Clean("sci fi"), Clean()));
        }
    }
}
