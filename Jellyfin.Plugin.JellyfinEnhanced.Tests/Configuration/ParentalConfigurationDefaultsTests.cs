using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using System.Xml.Serialization;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Configuration
{
    public sealed class ParentalConfigurationDefaultsTests
    {
        [Fact]
        public void NewAndLegacyMissingSettings_UseSafeDefaults()
        {
            var configuration = new PluginConfiguration();

            Assert.True(configuration.SeerrRespectParentalRatings);
            Assert.True(configuration.SeerrRespectBlockedTags);
            Assert.Equal(1440, configuration.SeerrParentalRatingCacheTtlMinutes);
        }

        [Fact]
        public void LegacyXmlWithoutParentalElements_PreservesConstructorDefaults()
        {
            var serializer = new XmlSerializer(typeof(PluginConfiguration));
            using var reader = new StringReader("<PluginConfiguration />");

            var configuration = Assert.IsType<PluginConfiguration>(serializer.Deserialize(reader));

            Assert.True(configuration.SeerrRespectParentalRatings);
            Assert.True(configuration.SeerrRespectBlockedTags);
            Assert.Equal(1440, configuration.SeerrParentalRatingCacheTtlMinutes);
        }

        [Fact]
        public void ExplicitParentalSettings_RoundTripThroughPluginXml()
        {
            var serializer = new XmlSerializer(typeof(PluginConfiguration));
            var expected = new PluginConfiguration
            {
                SeerrRespectParentalRatings = false,
                SeerrRespectBlockedTags = false,
                SeerrParentalRatingCacheTtlMinutes = 37,
            };
            using var writer = new StringWriter();
            serializer.Serialize(writer, expected);
            using var reader = new StringReader(writer.ToString());

            var actual = Assert.IsType<PluginConfiguration>(serializer.Deserialize(reader));

            Assert.False(actual.SeerrRespectParentalRatings);
            Assert.False(actual.SeerrRespectBlockedTags);
            Assert.Equal(37, actual.SeerrParentalRatingCacheTtlMinutes);
        }
    }
}
