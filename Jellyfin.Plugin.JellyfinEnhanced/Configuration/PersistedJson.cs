using System;
using System.Buffers;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>
    /// The single System.Text.Json configuration for every JSON file the plugin
    /// persists to disk (per-user settings/shortcuts/bookmarks/elsewhere/
    /// hidden-content/watchlist files, the shared reviews.json, and
    /// maintenance-state.json).
    ///
    /// These options replicate the on-disk format and the read tolerance used
    /// by known files from the original Newtonsoft.Json persistence path. That
    /// includes comments, trailing commas, single-quoted strings and unquoted
    /// identifier property names. Files written by this version stay readable
    /// by older plugin versions. The contract is pinned byte-for-byte by
    /// UserFileFormatGoldenTests and semantically by UserFileReadCompatTests.
    /// </summary>
    internal static class PersistedJson
    {
        /// <summary>
        /// Write options — Newtonsoft equivalent:
        /// <c>JsonConvert.SerializeObject(value, Formatting.Indented)</c> with default settings.
        /// </summary>
        internal static readonly JsonSerializerOptions WriteOptions = new JsonSerializerOptions
        {
            // Newtonsoft Formatting.Indented: 2-space indent (both stacks default to
            // 2 spaces and to Environment.NewLine line breaks on .NET 9+).
            WriteIndented = true,

            // Newtonsoft StringEscapeHandling.Default escapes only quotes, backslash
            // and control characters; STJ's default encoder would \uXXXX-escape all
            // non-ASCII, changing every existing accented/CJK value on disk. The
            // relaxed encoder keeps BMP text raw. (Known residual difference: astral
            // -plane chars (emoji) are still written as surrogate-pair escapes —
            // semantically identical JSON, pinned by EmojiLabel_RoundTripsByValue.)
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,

            // Newtonsoft NullValueHandling.Include (default) on the WRITE path:
            // null properties are written out, not omitted. STJ's default is the
            // same (DefaultIgnoreCondition = Never) — spelled out here because the
            // old read path's NullValueHandling.Ignore comment makes it easy to
            // assume nulls were skipped everywhere.
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,

            // No PropertyNamingPolicy: property names serialize as-is (PascalCase),
            // exactly like Newtonsoft's default ContractResolver.
        };

        /// <summary>
        /// Read options — Newtonsoft equivalent: <c>JsonConvert.DeserializeObject&lt;T&gt;(json)</c>
        /// with default settings (the strict/RMW path). The lenient path additionally
        /// applies <see cref="StripNullMembers"/> (= NullValueHandling.Ignore on read).
        /// </summary>
        internal static readonly JsonSerializerOptions ReadOptions = new JsonSerializerOptions
        {
            // Newtonsoft matches member names case-insensitively by default. Files
            // written via the raw client-JSON pass-through have camelCase keys on disk.
            PropertyNameCaseInsensitive = true,

            // Newtonsoft's reader tolerates trailing commas and comments (relevant
            // for hand-edited user files).
            AllowTrailingCommas = true,
            ReadCommentHandling = JsonCommentHandling.Skip,

            // Newtonsoft coerces numeric strings to numbers ("7" -> 7). Legacy files
            // written from raw client payloads rely on this.
            NumberHandling = JsonNumberHandling.AllowReadingFromString,

            // Newtonsoft also coerces number/bool tokens to string properties and
            // string/number tokens to bool properties; see the converters.
            Converters = { new LenientStringConverter(), new LenientBooleanConverter() },

            // Unknown members are ignored by default in both stacks
            // (Newtonsoft MissingMemberHandling.Ignore).
        };

        /// <summary>
        /// Parse options matching the reader tolerance of <see cref="ReadOptions"/>
        /// for the JsonNode-based lenient pre-pass.
        /// </summary>
        internal static readonly JsonDocumentOptions ParseOptions = new JsonDocumentOptions
        {
            AllowTrailingCommas = true,
            CommentHandling = JsonCommentHandling.Skip,
        };

        /// <summary>
        /// Parses a persisted JSON document while preserving the Json.NET syntax
        /// extensions supported by <see cref="NormalizeLegacyJson"/>.
        /// </summary>
        internal static JsonNode? ParseNode(string json)
        {
            try
            {
                return JsonNode.Parse(json, documentOptions: ParseOptions);
            }
            catch (JsonException)
            {
                var normalized = NormalizeLegacyJson(json);
                if (ReferenceEquals(normalized, json))
                {
                    throw;
                }

                return JsonNode.Parse(normalized, documentOptions: ParseOptions);
            }
        }

        /// <summary>
        /// Deserializes persisted JSON with the same legacy-syntax compatibility
        /// fallback as <see cref="ParseNode"/>.
        /// </summary>
        internal static T? Deserialize<T>(string json)
        {
            try
            {
                return JsonSerializer.Deserialize<T>(json, ReadOptions);
            }
            catch (JsonException)
            {
                var normalized = NormalizeLegacyJson(json);
                if (ReferenceEquals(normalized, json))
                {
                    throw;
                }

                return JsonSerializer.Deserialize<T>(normalized, ReadOptions);
            }
        }

        /// <summary>
        /// Converts Json.NET's commonly used JSON extensions (single-quoted
        /// strings and unquoted identifier property names) to standard JSON.
        /// Double-quoted strings and comments are copied verbatim, so content
        /// inside either cannot be mistaken for syntax.
        /// </summary>
        private static string NormalizeLegacyJson(string json)
        {
            StringBuilder? output = null;
            var inDoubleQuotedString = false;
            var inSingleQuotedString = false;
            var inLineComment = false;
            var inBlockComment = false;

            for (var i = 0; i < json.Length; i++)
            {
                var c = json[i];

                if (inLineComment)
                {
                    output?.Append(c);
                    if (c is '\r' or '\n')
                    {
                        inLineComment = false;
                    }

                    continue;
                }

                if (inBlockComment)
                {
                    output?.Append(c);
                    if (c == '*' && i + 1 < json.Length && json[i + 1] == '/')
                    {
                        output?.Append('/');
                        i++;
                        inBlockComment = false;
                    }

                    continue;
                }

                if (inDoubleQuotedString)
                {
                    output?.Append(c);
                    if (c == '\\' && i + 1 < json.Length)
                    {
                        output?.Append(json[++i]);
                    }
                    else if (c == '"')
                    {
                        inDoubleQuotedString = false;
                    }

                    continue;
                }

                if (inSingleQuotedString)
                {
                    if (c == '\\' && i + 1 < json.Length)
                    {
                        var escaped = json[++i];
                        if (escaped == '\'')
                        {
                            output!.Append('\'');
                        }
                        else
                        {
                            output!.Append('\\').Append(escaped);
                        }
                    }
                    else if (c == '\'')
                    {
                        output!.Append('"');
                        inSingleQuotedString = false;
                    }
                    else if (c == '"')
                    {
                        output!.Append("\\\"");
                    }
                    else
                    {
                        output!.Append(c);
                    }

                    continue;
                }

                if (c == '"')
                {
                    output?.Append(c);
                    inDoubleQuotedString = true;
                }
                else if (c == '\'')
                {
                    output ??= new StringBuilder(json.Length + 16).Append(json, 0, i);
                    output.Append('"');
                    inSingleQuotedString = true;
                }
                else if (IsLegacyPropertyNameStart(c))
                {
                    var end = i + 1;
                    while (end < json.Length && IsLegacyPropertyNamePart(json[end]))
                    {
                        end++;
                    }

                    var colon = end;
                    while (colon < json.Length && char.IsWhiteSpace(json[colon]))
                    {
                        colon++;
                    }

                    if (colon < json.Length && json[colon] == ':')
                    {
                        output ??= new StringBuilder(json.Length + 16).Append(json, 0, i);
                        output.Append('"').Append(json, i, end - i).Append('"');
                        i = end - 1;
                    }
                    else
                    {
                        output?.Append(c);
                    }
                }
                else if (c == '/' && i + 1 < json.Length && json[i + 1] == '/')
                {
                    output?.Append("//");
                    i++;
                    inLineComment = true;
                }
                else if (c == '/' && i + 1 < json.Length && json[i + 1] == '*')
                {
                    output?.Append("/*");
                    i++;
                    inBlockComment = true;
                }
                else
                {
                    output?.Append(c);
                }
            }

            return output?.ToString() ?? json;
        }

        private static bool IsLegacyPropertyNameStart(char c)
            => c is '_' or '$' || char.IsLetter(c);

        private static bool IsLegacyPropertyNamePart(char c)
            => c is '_' or '$' || char.IsLetterOrDigit(c);

        /// <summary>
        /// Newtonsoft <c>NullValueHandling.Ignore</c> on DESERIALIZATION: a JSON null
        /// member is skipped entirely, so the target property keeps its constructor
        /// default instead of being set to null (or throwing for non-nullable types).
        /// STJ has no equivalent option, so the lenient read path removes null-valued
        /// object members before binding. Null ARRAY elements are kept (Newtonsoft's
        /// setting never applied to collection items). Null dictionary entries are
        /// removed — Newtonsoft materialized them as null values, which no caller can
        /// use; dropping them is the safe reading of the same file.
        /// </summary>
        internal static JsonNode? StripNullMembers(JsonNode? node)
        {
            switch (node)
            {
                case JsonObject obj:
                    foreach (var key in obj.Where(kv => kv.Value is null).Select(kv => kv.Key).ToList())
                    {
                        obj.Remove(key);
                    }

                    foreach (var kv in obj)
                    {
                        StripNullMembers(kv.Value);
                    }

                    break;

                case JsonArray arr:
                    foreach (var element in arr)
                    {
                        StripNullMembers(element);
                    }

                    break;
            }

            return node;
        }

        /// <summary>
        /// Newtonsoft coerced non-string primitives into string properties
        /// (e.g. a legacy client payload stored <c>"TmdbId": 27205</c> as a number;
        /// the DTO property is string). Numbers keep their raw JSON text; booleans
        /// become "True"/"False" (Convert.ToString parity with Newtonsoft).
        /// </summary>
        private sealed class LenientStringConverter : JsonConverter<string>
        {
            public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                switch (reader.TokenType)
                {
                    case JsonTokenType.String:
                        return reader.GetString();
                    case JsonTokenType.Number:
                        return Encoding.UTF8.GetString(reader.HasValueSequence ? reader.ValueSequence.ToArray() : reader.ValueSpan);
                    case JsonTokenType.True:
                        return "True";
                    case JsonTokenType.False:
                        return "False";
                    default:
                        throw new JsonException($"Cannot convert {reader.TokenType} token to string.");
                }
            }

            public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
                => writer.WriteStringValue(value);
        }

        /// <summary>
        /// Newtonsoft coerced "true"/"false" strings and 0/1 numbers into bool
        /// properties. Same tolerance here; anything unparseable throws JsonException
        /// exactly like an incompatible token would.
        /// </summary>
        private sealed class LenientBooleanConverter : JsonConverter<bool>
        {
            public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                switch (reader.TokenType)
                {
                    case JsonTokenType.True:
                        return true;
                    case JsonTokenType.False:
                        return false;
                    case JsonTokenType.String:
                        var text = reader.GetString();
                        if (bool.TryParse(text, out var parsed))
                        {
                            return parsed;
                        }

                        throw new JsonException($"Cannot convert string '{text}' to bool.");
                    case JsonTokenType.Number:
                        // Convert.ToBoolean parity: any non-zero number is true.
                        return reader.GetDouble() != 0;
                    default:
                        throw new JsonException($"Cannot convert {reader.TokenType} token to bool.");
                }
            }

            public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
                => writer.WriteBooleanValue(value);
        }
    }
}
