using System.Collections.Generic;
using System.Linq;

namespace Jellyfin.Plugin.JellyfinEnhanced.Diagnostics
{
    public sealed class DiagnosticRegistry
    {
        private static readonly DiagnosticRegistry _instance = new DiagnosticRegistry();
        private readonly List<IDiagnosticSection> _sections = new List<IDiagnosticSection>();
        private readonly object _lock = new object();

        private DiagnosticRegistry()
        {
        }

        public static DiagnosticRegistry Instance => _instance;

        public void Register(IDiagnosticSection section)
        {
            lock (_lock)
            {
                if (_sections.All(s => s.SectionId != section.SectionId))
                {
                    _sections.Add(section);
                }
            }
        }

        public IReadOnlyList<IDiagnosticSection> GetSections()
        {
            lock (_lock)
            {
                return _sections.ToList().AsReadOnly();
            }
        }
    }
}
