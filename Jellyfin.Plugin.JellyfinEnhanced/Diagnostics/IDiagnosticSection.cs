using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Diagnostics
{
    public interface IDiagnosticSection
    {
        string SectionId { get; }

        string DisplayName { get; }

        Task<object> CollectAsync();
    }
}
