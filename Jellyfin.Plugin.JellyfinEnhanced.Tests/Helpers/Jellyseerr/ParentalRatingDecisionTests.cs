using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Helpers.Jellyseerr
{
    /// <summary>
    /// Pins the score branches of Jellyfin's native parental decision, including
    /// the sub-score and unrated behavior that a simple string comparison misses.
    /// </summary>
    public sealed class ParentalRatingDecisionTests
    {
        private static readonly UnratedItem[] NoBlockedUnratedTypes = Array.Empty<UnratedItem>();

        [Theory]
        [InlineData(0)]
        [InlineData(13)]
        [InlineData(17)]
        [InlineData(1000)]
        public void NoMaximum_AllowsRatedItem(int itemScore)
            => Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore,
                itemSubScore: 0,
                UnratedItem.Movie,
                maxScore: null,
                maxSubScore: null,
                NoBlockedUnratedTypes));

        [Theory]
        [InlineData(10, 13, true)]
        [InlineData(13, 13, true)]
        [InlineData(17, 13, false)]
        [InlineData(0, 0, true)]
        [InlineData(13, 10, false)]
        public void PrimaryScore_IsComparedAgainstMaximum(int itemScore, int maxScore, bool expected)
            => Assert.Equal(expected, ParentalRatingDecision.IsAllowed(
                itemScore,
                itemSubScore: 0,
                UnratedItem.Movie,
                maxScore,
                maxSubScore: 0,
                NoBlockedUnratedTypes));

        [Theory]
        [InlineData(17, 0, 17, 0, true)]
        [InlineData(17, 1, 17, 0, false)]
        [InlineData(17, 0, 17, 1, true)]
        [InlineData(14, 99, 13, 0, false)]
        [InlineData(12, 99, 13, 0, true)]
        public void SubScore_IsLexicographicTieBreaker(
            int itemScore,
            int itemSubScore,
            int maxScore,
            int maxSubScore,
            bool expected)
            => Assert.Equal(expected, ParentalRatingDecision.IsAllowed(
                itemScore,
                itemSubScore,
                UnratedItem.Movie,
                maxScore,
                maxSubScore,
                NoBlockedUnratedTypes));

        [Fact]
        public void NullMaximumSubScore_IsUnboundedAtMatchingPrimaryScore()
            => Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore: 17,
                itemSubScore: int.MaxValue,
                UnratedItem.Movie,
                maxScore: 17,
                maxSubScore: null,
                NoBlockedUnratedTypes));

        [Fact]
        public void NullItemSubScore_IsTreatedAsZero()
            => Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore: 13,
                itemSubScore: null,
                UnratedItem.Movie,
                maxScore: 13,
                maxSubScore: 0,
                NoBlockedUnratedTypes));

        [Fact]
        public void UnratedMovie_IsAllowedWhenMovieBucketIsNotBlocked()
            => Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore: null,
                itemSubScore: null,
                UnratedItem.Movie,
                maxScore: 0,
                maxSubScore: 0,
                NoBlockedUnratedTypes));

        [Fact]
        public void UnratedMovie_IsDeniedWhenMovieBucketIsBlocked()
            => Assert.False(ParentalRatingDecision.IsAllowed(
                itemScore: null,
                itemSubScore: null,
                UnratedItem.Movie,
                maxScore: null,
                maxSubScore: null,
                new[] { UnratedItem.Movie }));

        [Fact]
        public void UnratedSeries_UsesSeriesBucketIndependently()
        {
            Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore: null,
                itemSubScore: null,
                UnratedItem.Series,
                maxScore: null,
                maxSubScore: null,
                new[] { UnratedItem.Movie }));
            Assert.False(ParentalRatingDecision.IsAllowed(
                itemScore: null,
                itemSubScore: null,
                UnratedItem.Series,
                maxScore: null,
                maxSubScore: null,
                new[] { UnratedItem.Series }));
        }

        [Fact]
        public void NullBlockedUnratedCollection_AllowsUnratedItem()
            => Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore: null,
                itemSubScore: null,
                UnratedItem.Movie,
                maxScore: 13,
                maxSubScore: 0,
                blockUnrated: null));

        [Fact]
        public void RatedItem_DoesNotUseBlockedUnratedBuckets()
            => Assert.True(ParentalRatingDecision.IsAllowed(
                itemScore: 10,
                itemSubScore: 0,
                UnratedItem.Movie,
                maxScore: 13,
                maxSubScore: 0,
                new[] { UnratedItem.Movie }));
    }
}
