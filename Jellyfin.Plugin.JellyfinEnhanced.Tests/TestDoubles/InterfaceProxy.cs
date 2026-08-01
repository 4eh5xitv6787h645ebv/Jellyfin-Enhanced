using System.Reflection;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.TestDoubles
{
    /// <summary>
    /// Small reflection-backed interface fake. It keeps the tests source-compatible
    /// when Jellyfin 10 and 12 add unrelated members to their service interfaces.
    /// </summary>
    internal class InterfaceProxy : DispatchProxy
    {
        private Func<MethodInfo, object?[]?, object?>? _handler;

        internal static T Create<T>(Func<MethodInfo, object?[]?, object?> handler)
            where T : class
        {
            var instance = DispatchProxy.Create<T, InterfaceProxy>();
            ((InterfaceProxy)(object)instance)._handler = handler;
            return instance;
        }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            ArgumentNullException.ThrowIfNull(targetMethod);
            return _handler!(targetMethod, args);
        }

        internal static object? DefaultValue(Type returnType)
        {
            if (returnType == typeof(void))
            {
                return null;
            }

            return returnType.IsValueType ? Activator.CreateInstance(returnType) : null;
        }
    }
}
