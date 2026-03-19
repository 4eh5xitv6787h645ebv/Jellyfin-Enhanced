using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Diagnostics
{
    public class CalendarDiagnosticSection : IDiagnosticSection
    {
        public string SectionId => "calendar";

        public string DisplayName => "Calendar";

        public Task<object> CollectAsync()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            var result = new
            {
                enabled = config?.CalendarPageEnabled ?? false,
                firstDayOfWeek = config?.CalendarFirstDayOfWeek ?? "Monday",
                timeFormat = config?.CalendarTimeFormat ?? "5pm/5:30pm",
                highlightFavorites = config?.CalendarHighlightFavorites ?? false,
                filterByLibraryAccess = config?.CalendarFilterByLibraryAccess ?? true,
                showOnlyRequested = config?.CalendarShowOnlyRequested ?? false
            };

            return Task.FromResult<object>(result);
        }
    }
}
