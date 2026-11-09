(() => {
"use strict";
(() => {
  // client/src/contracts/schema.ts
  var bootstrapSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$ref": "#/$defs/BootstrapResponse",
    "$defs": {
      "SpoilerBlurCollectionEntry": {
        "type": "object",
        "properties": {
          "CollectionId": {
            "type": "string"
          },
          "CollectionName": {
            "type": "string"
          },
          "EnabledAt": {
            "type": "string"
          }
        },
        "required": [
          "CollectionId",
          "CollectionName",
          "EnabledAt"
        ],
        "additionalProperties": false
      },
      "SpoilerBlurMovieEntry": {
        "type": "object",
        "properties": {
          "EnabledAt": {
            "type": "string"
          },
          "MovieId": {
            "type": "string"
          },
          "MovieName": {
            "type": "string"
          }
        },
        "required": [
          "EnabledAt",
          "MovieId",
          "MovieName"
        ],
        "additionalProperties": false
      },
      "SpoilerBlurPendingEntry": {
        "type": "object",
        "properties": {
          "DisplayName": {
            "type": "string"
          },
          "MediaType": {
            "type": "string"
          },
          "RequestedAt": {
            "type": "string"
          },
          "TmdbId": {
            "type": "string"
          }
        },
        "required": [
          "DisplayName",
          "MediaType",
          "RequestedAt",
          "TmdbId"
        ],
        "additionalProperties": false
      },
      "SpoilerBlurUserPrefs": {
        "type": "object",
        "properties": {
          "HideAirDate": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideCast": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideChapterNames": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideEpisodeDescriptions": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideRatings": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideReviews": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideSeriesDescriptions": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideTaglines": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideTags": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "HideTrickplay": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ReplaceEpisodeTitles": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "SkipDisableConfirm": {
            "type": "boolean"
          },
          "UseAdvancedCategories": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "HideAirDate",
          "HideCast",
          "HideChapterNames",
          "HideEpisodeDescriptions",
          "HideRatings",
          "HideReviews",
          "HideSeriesDescriptions",
          "HideTaglines",
          "HideTags",
          "HideTrickplay",
          "ReplaceEpisodeTitles",
          "SkipDisableConfirm",
          "UseAdvancedCategories"
        ],
        "additionalProperties": false
      },
      "SpoilerBlurSeriesEntry": {
        "type": "object",
        "properties": {
          "EnabledAt": {
            "type": "string"
          },
          "SeriesId": {
            "type": "string"
          },
          "SeriesName": {
            "type": "string"
          }
        },
        "required": [
          "EnabledAt",
          "SeriesId",
          "SeriesName"
        ],
        "additionalProperties": false
      },
      "UserSpoilerBlur": {
        "type": "object",
        "properties": {
          "Collections": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/$defs/SpoilerBlurCollectionEntry"
            }
          },
          "Movies": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/$defs/SpoilerBlurMovieEntry"
            }
          },
          "PendingTmdb": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/$defs/SpoilerBlurPendingEntry"
            }
          },
          "Prefs": {
            "$ref": "#/$defs/SpoilerBlurUserPrefs"
          },
          "Series": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/$defs/SpoilerBlurSeriesEntry"
            }
          }
        },
        "required": [
          "Collections",
          "Movies",
          "PendingTmdb",
          "Prefs",
          "Series"
        ],
        "additionalProperties": false
      },
      "BootstrapPrefetched": {
        "type": "object",
        "properties": {
          "ActiveStreamSessions": {
            "anyOf": [
              {
                "type": "array",
                "items": true
              },
              {
                "type": "null"
              }
            ]
          },
          "SeerrStatus": true,
          "SeerrUserStatus": true,
          "SpoilerBlurSeries": {
            "anyOf": [
              {
                "$ref": "#/$defs/UserSpoilerBlur"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagStripRevision": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "ActiveStreamSessions",
          "SeerrStatus",
          "SeerrUserStatus",
          "SpoilerBlurSeries",
          "TagStripRevision"
        ],
        "additionalProperties": false
      },
      "BootstrapCustomTagSource": {
        "type": "object",
        "properties": {
          "Id": {
            "type": "string"
          },
          "Match": {
            "type": "string"
          },
          "Value": {
            "type": "string"
          }
        },
        "required": [
          "Id",
          "Match",
          "Value"
        ],
        "additionalProperties": false
      },
      "BootstrapArrInstance": {
        "type": "object",
        "properties": {
          "Enabled": {
            "type": "boolean"
          },
          "Name": {
            "type": "string"
          },
          "Url": {
            "type": "string"
          },
          "UrlMappings": {
            "type": "string"
          }
        },
        "required": [
          "Enabled",
          "Name",
          "Url",
          "UrlMappings"
        ],
        "additionalProperties": false
      },
      "BootstrapPrivateConfig": {
        "type": "object",
        "properties": {
          "BazarrUrl": {
            "type": "string"
          },
          "BazarrUrlMappings": {
            "type": "string"
          },
          "CustomTagRuleSources": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/BootstrapCustomTagSource"
            }
          },
          "RadarrInstances": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/BootstrapArrInstance"
            }
          },
          "RadarrInstancesCorrupt": {
            "type": "boolean"
          },
          "RadarrUrl": {
            "type": "string"
          },
          "RadarrUrlMappings": {
            "type": "string"
          },
          "ShokoUrl": {
            "type": "string"
          },
          "ShokoUrlMappings": {
            "type": "string"
          },
          "SonarrInstances": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/BootstrapArrInstance"
            }
          },
          "SonarrInstancesCorrupt": {
            "type": "boolean"
          },
          "SonarrUrl": {
            "type": "string"
          },
          "SonarrUrlMappings": {
            "type": "string"
          }
        },
        "required": [
          "BazarrUrl",
          "BazarrUrlMappings",
          "CustomTagRuleSources",
          "RadarrInstances",
          "RadarrInstancesCorrupt",
          "RadarrUrl",
          "RadarrUrlMappings",
          "ShokoUrl",
          "ShokoUrlMappings",
          "SonarrInstances",
          "SonarrInstancesCorrupt",
          "SonarrUrl",
          "SonarrUrlMappings"
        ],
        "additionalProperties": false
      },
      "BootstrapCustomTagRule": {
        "type": "object",
        "properties": {
          "Icon": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Id": {
            "type": "string"
          },
          "Label": {
            "type": "string"
          }
        },
        "required": [
          "Icon",
          "Id",
          "Label"
        ],
        "additionalProperties": false
      },
      "Shortcut": {
        "type": "object",
        "properties": {
          "Category": {
            "type": "string"
          },
          "Key": {
            "type": "string"
          },
          "Label": {
            "type": "string"
          },
          "Name": {
            "type": "string"
          }
        },
        "required": [
          "Category",
          "Key",
          "Label",
          "Name"
        ],
        "additionalProperties": false
      },
      "TagGroupCaps": {
        "type": "object",
        "properties": {
          "AgeRating": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Awards": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Custom": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Genre": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Language": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Logos": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Quality": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Rating": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "Status": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "AgeRating",
          "Awards",
          "Custom",
          "Genre",
          "Language",
          "Logos",
          "Quality",
          "Rating",
          "Status"
        ],
        "additionalProperties": false
      },
      "TagScopeSet": {
        "type": "object",
        "properties": {
          "ContinueWatching": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "Episodes": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "Movies": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "NextUp": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "Seasons": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "Series": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "ContinueWatching",
          "Episodes",
          "Movies",
          "NextUp",
          "Seasons",
          "Series"
        ],
        "additionalProperties": false
      },
      "TagGroupScopes": {
        "type": "object",
        "properties": {
          "AgeRating": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Awards": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Custom": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Genre": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Language": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Logos": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Quality": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Rating": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          },
          "Status": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagScopeSet"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "AgeRating",
          "Awards",
          "Custom",
          "Genre",
          "Language",
          "Logos",
          "Quality",
          "Rating",
          "Status"
        ],
        "additionalProperties": false
      },
      "TagLayoutGroupSlot": {
        "type": "object",
        "properties": {
          "Group": {
            "type": "string"
          },
          "Slot": {
            "type": "string"
          }
        },
        "required": [
          "Group",
          "Slot"
        ],
        "additionalProperties": false
      },
      "TagLayoutProfile": {
        "type": "object",
        "properties": {
          "Groups": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/TagLayoutGroupSlot"
            }
          }
        },
        "required": [
          "Groups"
        ],
        "additionalProperties": false
      },
      "TagLayoutProfiles": {
        "type": "object",
        "properties": {
          "Bands": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfile"
              },
              {
                "type": "null"
              }
            ]
          },
          "Caption": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfile"
              },
              {
                "type": "null"
              }
            ]
          },
          "Corners": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfile"
              },
              {
                "type": "null"
              }
            ]
          },
          "Minimal": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfile"
              },
              {
                "type": "null"
              }
            ]
          },
          "Summary": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfile"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "Bands",
          "Caption",
          "Corners",
          "Minimal",
          "Summary"
        ],
        "additionalProperties": false
      },
      "TagShapeLook": {
        "type": "object",
        "properties": {
          "Caps": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupCaps"
              },
              {
                "type": "null"
              }
            ]
          },
          "Density": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Layout": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Slots": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLayoutGroupSlot"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGap": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagScale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "Caps",
          "Density",
          "Layout",
          "Slots",
          "TagGap",
          "TagScale"
        ],
        "additionalProperties": false
      },
      "TagShapeOverrides": {
        "type": "object",
        "properties": {
          "Landscape": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeLook"
              },
              {
                "type": "null"
              }
            ]
          },
          "List": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeLook"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "Landscape",
          "List"
        ],
        "additionalProperties": false
      },
      "TagLookItemOverride": {
        "type": "object",
        "properties": {
          "Caps": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupCaps"
              },
              {
                "type": "null"
              }
            ]
          },
          "ColourPreset": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Density": {
            "type": "string"
          },
          "EdgeSpacing": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "ItemId": {
            "type": "string"
          },
          "Layout": {
            "type": "string"
          },
          "LockedAt": {
            "type": "integer"
          },
          "Scope": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Shapes": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeOverrides"
              },
              {
                "type": "null"
              }
            ]
          },
          "Slots": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLayoutGroupSlot"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGap": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagScale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "Caps",
          "ColourPreset",
          "Density",
          "EdgeSpacing",
          "ItemId",
          "Layout",
          "LockedAt",
          "Scope",
          "Shapes",
          "Slots",
          "TagGap",
          "TagScale"
        ],
        "additionalProperties": false
      },
      "TagLookCondition": {
        "type": "object",
        "properties": {
          "Field": {
            "type": "string"
          },
          "Value": {
            "type": "string"
          }
        },
        "required": [
          "Field",
          "Value"
        ],
        "additionalProperties": false
      },
      "TagLookRule": {
        "type": "object",
        "properties": {
          "ColourPreset": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Density": {
            "type": "string"
          },
          "Enabled": {
            "type": "boolean"
          },
          "Id": {
            "type": "string"
          },
          "Layout": {
            "type": "string"
          },
          "Shapes": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeOverrides"
              },
              {
                "type": "null"
              }
            ]
          },
          "Slots": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLayoutGroupSlot"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "When": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/TagLookCondition"
            }
          }
        },
        "required": [
          "ColourPreset",
          "Density",
          "Enabled",
          "Id",
          "Layout",
          "Shapes",
          "Slots",
          "When"
        ],
        "additionalProperties": false
      },
      "BootstrapPublicConfig": {
        "type": "object",
        "properties": {
          "ActiveStreamsAllUsers": {
            "type": "boolean"
          },
          "ActiveStreamsEnabled": {
            "type": "boolean"
          },
          "ActivityFeedEnabled": {
            "type": "boolean"
          },
          "ActivityFeedShowActiveStreams": {
            "type": "boolean"
          },
          "ActivityFeedShowFavorited": {
            "type": "boolean"
          },
          "ActivityFeedShowReviewed": {
            "type": "boolean"
          },
          "ActivityFeedShowWatched": {
            "type": "boolean"
          },
          "ActivityFeedUseCustomTabs": {
            "type": "boolean"
          },
          "ActivityFeedUseNativeTab": {
            "type": "boolean"
          },
          "AddRequestedMediaToWatchlist": {
            "type": "boolean"
          },
          "AgeRatingTagsEnabled": {
            "type": "boolean"
          },
          "AgeRatingTagsPosition": {
            "type": "string"
          },
          "AnalyticsEnabled": {
            "type": "boolean"
          },
          "AnalyticsShareUsageCounts": {
            "type": "boolean"
          },
          "ArrLinksEnabled": {
            "type": "boolean"
          },
          "ArrLinksShowStatusSingle": {
            "type": "boolean"
          },
          "ArrTagsLinksFilter": {
            "type": "string"
          },
          "ArrTagsLinksHideFilter": {
            "type": "string"
          },
          "ArrTagsPrefix": {
            "type": "string"
          },
          "ArrTagsShowAsLinks": {
            "type": "boolean"
          },
          "ArrTagsSyncEnabled": {
            "type": "boolean"
          },
          "AspectRatioTagOrder": {
            "type": "integer"
          },
          "AudioInfoTagOrder": {
            "type": "integer"
          },
          "AudioLanguageTagPrefix": {
            "type": "string"
          },
          "AudioLanguageTagShowAsLinks": {
            "type": "boolean"
          },
          "AudioLanguageTagSyncEnabled": {
            "type": "boolean"
          },
          "AutoPauseEnabled": {
            "type": "boolean"
          },
          "AutoPipEnabled": {
            "type": "boolean"
          },
          "AutoResumeEnabled": {
            "type": "boolean"
          },
          "AutoSkipIntro": {
            "type": "boolean"
          },
          "AutoSkipOutro": {
            "type": "boolean"
          },
          "AwardsTagsCertifiedFresh": {
            "type": "boolean"
          },
          "AwardsTagsEmmy": {
            "type": "boolean"
          },
          "AwardsTagsEnabled": {
            "type": "boolean"
          },
          "AwardsTagsImdb": {
            "type": "boolean"
          },
          "AwardsTagsLetterboxd": {
            "type": "boolean"
          },
          "AwardsTagsOscar": {
            "type": "boolean"
          },
          "AwardsTagsPosition": {
            "type": "string"
          },
          "BookmarksEnabled": {
            "type": "boolean"
          },
          "BookmarksUseCustomTabs": {
            "type": "boolean"
          },
          "BookmarksUseNativeTab": {
            "type": "boolean"
          },
          "BookmarksUsePluginPages": {
            "type": "boolean"
          },
          "CalendarFilterByLibraryAccess": {
            "type": "boolean"
          },
          "CalendarFirstDayOfWeek": {
            "type": "string"
          },
          "CalendarForceOnlyRequested": {
            "type": "boolean"
          },
          "CalendarHighlightFavorites": {
            "type": "boolean"
          },
          "CalendarHighlightWatchedSeries": {
            "type": "boolean"
          },
          "CalendarPageEnabled": {
            "type": "boolean"
          },
          "CalendarShowOnlyRequested": {
            "type": "boolean"
          },
          "CalendarTimeFormat": {
            "type": "string"
          },
          "CalendarUseCustomTabs": {
            "type": "boolean"
          },
          "CalendarUseNativeTab": {
            "type": "boolean"
          },
          "CalendarUsePluginPages": {
            "type": "boolean"
          },
          "CatchUpEnabled": {
            "type": "boolean"
          },
          "CatchUpUseCustomTabs": {
            "type": "boolean"
          },
          "CatchUpUseNativeTab": {
            "type": "boolean"
          },
          "CatchUpUsePluginPages": {
            "type": "boolean"
          },
          "ClearLocalStorageTimestamp": {
            "type": "integer"
          },
          "ClearTranslationCacheTimestamp": {
            "type": "integer"
          },
          "ColoredActivityIconsEnabled": {
            "type": "boolean"
          },
          "ColoredRatingsEnabled": {
            "type": "boolean"
          },
          "CustomTagRules": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/BootstrapCustomTagRule"
            }
          },
          "CustomTagsEnabled": {
            "type": "boolean"
          },
          "CustomTagsPosition": {
            "type": "string"
          },
          "DEFAULT_PROVIDERS": {
            "type": "string"
          },
          "DEFAULT_REGION": {
            "type": "string"
          },
          "DefaultLanguage": {
            "type": "string"
          },
          "DefaultSubtitleFont": {
            "type": "integer"
          },
          "DefaultSubtitleSize": {
            "type": "integer"
          },
          "DefaultSubtitleStyle": {
            "type": "integer"
          },
          "DefaultSubtitleTextEffect": {
            "type": "integer"
          },
          "DisableAllShortcuts": {
            "type": "boolean"
          },
          "DisableCustomSubtitleStyles": {
            "type": "boolean"
          },
          "DisableTagsOnSearchPage": {
            "type": "boolean"
          },
          "DoesTheDogDieEnabled": {
            "type": "boolean"
          },
          "DownloadsFilterByUserRequests": {
            "type": "boolean"
          },
          "DownloadsHistoryAdminOnly": {
            "type": "boolean"
          },
          "DownloadsPageEnabled": {
            "type": "boolean"
          },
          "DownloadsPagePollingEnabled": {
            "type": "boolean"
          },
          "DownloadsPageShowIssues": {
            "type": "boolean"
          },
          "DownloadsPollIntervalSeconds": {
            "type": "integer"
          },
          "DownloadsShowHistory": {
            "type": "boolean"
          },
          "DownloadsUseCustomTabs": {
            "type": "boolean"
          },
          "DownloadsUseNativeTab": {
            "type": "boolean"
          },
          "DownloadsUsePluginPages": {
            "type": "boolean"
          },
          "DynamicRangeTagOrder": {
            "type": "integer"
          },
          "EditionTagOrder": {
            "type": "integer"
          },
          "ElsewhereCustomBrandingImageUrl": {
            "type": "string"
          },
          "ElsewhereCustomBrandingText": {
            "type": "string"
          },
          "ElsewhereEnabled": {
            "type": "boolean"
          },
          "ElsewhereSeasonProviders": {
            "type": "boolean"
          },
          "EnableCustomSplashScreen": {
            "type": "boolean"
          },
          "EnableLoginImage": {
            "type": "boolean"
          },
          "EnableTagsLocalStorageFallback": {
            "type": "boolean"
          },
          "FrameRateTagOrder": {
            "type": "integer"
          },
          "GenreTagsEnabled": {
            "type": "boolean"
          },
          "GenreTagsPosition": {
            "type": "string"
          },
          "HelpPanelAutocloseDelay": {
            "type": "integer"
          },
          "HiddenContentAdmin": {
            "type": "boolean"
          },
          "HiddenContentEnabled": {
            "type": "boolean"
          },
          "HiddenContentUseCustomTabs": {
            "type": "boolean"
          },
          "HiddenContentUseNativeTab": {
            "type": "boolean"
          },
          "HiddenContentUsePluginPages": {
            "type": "boolean"
          },
          "HideReviewsFromDisabledUsers": {
            "type": "boolean"
          },
          "HideReviewsFromHiddenUsers": {
            "type": "boolean"
          },
          "IGNORE_PROVIDERS": {
            "type": "string"
          },
          "IconStyle": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "JellyseerrAutoImportUsers": {
            "type": "boolean"
          },
          "JellyseerrAvailablePosterLinksToJellyfin": {
            "type": "boolean"
          },
          "JellyseerrBaseUrl": {
            "type": "string"
          },
          "JellyseerrDisableCache": {
            "type": "boolean"
          },
          "JellyseerrEnable4KRequests": {
            "type": "boolean"
          },
          "JellyseerrEnable4KTvRequests": {
            "type": "boolean"
          },
          "JellyseerrEnabled": {
            "type": "boolean"
          },
          "JellyseerrExcludeBlocklistedItems": {
            "type": "boolean"
          },
          "JellyseerrExcludeLibraryItems": {
            "type": "boolean"
          },
          "JellyseerrSearchExcludeLibraryItems": {
            "type": "boolean"
          },
          "JellyseerrShowAdvanced": {
            "type": "boolean"
          },
          "JellyseerrShowCollectionDiscovery": {
            "type": "boolean"
          },
          "JellyseerrShowDetailPageLink": {
            "type": "boolean"
          },
          "JellyseerrShowDetailPageLinkAsText": {
            "type": "boolean"
          },
          "JellyseerrShowGenreDiscovery": {
            "type": "boolean"
          },
          "JellyseerrShowIssueIndicator": {
            "type": "boolean"
          },
          "JellyseerrShowNetworkDiscovery": {
            "type": "boolean"
          },
          "JellyseerrShowPersonDiscovery": {
            "type": "boolean"
          },
          "JellyseerrShowQuotaInfo": {
            "type": "boolean"
          },
          "JellyseerrShowRecommended": {
            "type": "boolean"
          },
          "JellyseerrShowReportButton": {
            "type": "boolean"
          },
          "JellyseerrShowRequestMoreOnSeries": {
            "type": "boolean"
          },
          "JellyseerrShowSearchResults": {
            "type": "boolean"
          },
          "JellyseerrShowSimilar": {
            "type": "boolean"
          },
          "JellyseerrShowTagDiscovery": {
            "type": "boolean"
          },
          "JellyseerrSingleSeasonRequestOnly": {
            "type": "boolean"
          },
          "JellyseerrUrlMappings": {
            "type": "string"
          },
          "JellyseerrUseMoreInfoModal": {
            "type": "boolean"
          },
          "LanguageTagsCountBadge": {
            "type": "string"
          },
          "LanguageTagsEnabled": {
            "type": "boolean"
          },
          "LanguageTagsMergeRegions": {
            "type": "boolean"
          },
          "LanguageTagsPosition": {
            "type": "string"
          },
          "LanguageTagsPriority": {
            "type": "string"
          },
          "LanguageTagsPriorityStrict": {
            "type": "boolean"
          },
          "LanguageTagsShowAudio": {
            "type": "boolean"
          },
          "LanguageTagsShowSubtitles": {
            "type": "boolean"
          },
          "LanguageTagsStyle": {
            "type": "string"
          },
          "LeavingSoonAvailable": {
            "type": "boolean"
          },
          "LetterboxdEnabled": {
            "type": "boolean"
          },
          "LogoTagsEnabled": {
            "type": "boolean"
          },
          "LogoTagsMaxLogos": {
            "type": "integer"
          },
          "LogoTagsMovieMode": {
            "type": "string"
          },
          "LogoTagsPosition": {
            "type": "string"
          },
          "LogoTagsSeriesMode": {
            "type": "string"
          },
          "LongPress2xEnabled": {
            "type": "boolean"
          },
          "MaintenanceModeAction": {
            "type": "string"
          },
          "MaintenanceModeAffectedUsers": {
            "type": "string"
          },
          "MaintenanceModeEnabled": {
            "type": "boolean"
          },
          "MaintenanceModeEndsAt": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "MaintenanceModeMessage": {
            "type": "string"
          },
          "MdblistEnabled": {
            "type": "boolean"
          },
          "MdblistRatingsEnabled": {
            "type": "boolean"
          },
          "MdblistRatingsShowOnItemDetails": {
            "type": "boolean"
          },
          "MdblistRatingsShowPercentSymbol": {
            "type": "boolean"
          },
          "MdblistRatingsSources": {
            "type": "string"
          },
          "MetadataIconsEnabled": {
            "type": "boolean"
          },
          "NativePosterTagsEnabled": {
            "type": "boolean"
          },
          "PauseScreenDelaySeconds": {
            "type": "integer"
          },
          "PauseScreenEnabled": {
            "type": "boolean"
          },
          "PeopleTagsEnabled": {
            "type": "boolean"
          },
          "PluginIconsEnabled": {
            "type": "boolean"
          },
          "QualityAudioDisplayMode": {
            "type": "string"
          },
          "QualityHdrDisplayMode": {
            "type": "string"
          },
          "QualityHideSdr": {
            "type": "boolean"
          },
          "QualityMinimumResolution": {
            "type": "string"
          },
          "QualityTagsAudioLanguageFromUser": {
            "type": "boolean"
          },
          "QualityTagsEnabled": {
            "type": "boolean"
          },
          "QualityTagsPosition": {
            "type": "string"
          },
          "QualityTagsPreferredAudioLanguage": {
            "type": "string"
          },
          "QualityVideoCodecDisplayMode": {
            "type": "string"
          },
          "RandomButtonEnabled": {
            "type": "boolean"
          },
          "RandomIncludeMovies": {
            "type": "boolean"
          },
          "RandomIncludeShows": {
            "type": "boolean"
          },
          "RandomScopeCurrentContainer": {
            "type": "boolean"
          },
          "RandomUnwatchedOnly": {
            "type": "boolean"
          },
          "RatingTagsColorByScore": {
            "type": "boolean"
          },
          "RatingTagsEnabled": {
            "type": "boolean"
          },
          "RatingTagsMinScore": {
            "type": "number"
          },
          "RatingTagsOnContinueWatching": {
            "type": "boolean"
          },
          "RatingTagsOnEpisodes": {
            "type": "boolean"
          },
          "RatingTagsOnMovies": {
            "type": "boolean"
          },
          "RatingTagsOnNextUp": {
            "type": "boolean"
          },
          "RatingTagsOnSeasons": {
            "type": "boolean"
          },
          "RatingTagsOnSeries": {
            "type": "boolean"
          },
          "RatingTagsPosition": {
            "type": "string"
          },
          "RatingTagsShowCommunity": {
            "type": "boolean"
          },
          "RatingTagsShowCritic": {
            "type": "boolean"
          },
          "RatingTagsSources": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "RecommendationsPageEnabled": {
            "type": "boolean"
          },
          "RecommendationsUseCustomTabs": {
            "type": "boolean"
          },
          "RecommendationsUseNativeTab": {
            "type": "boolean"
          },
          "RemoveContinueWatchingEnabled": {
            "type": "boolean"
          },
          "ResolutionTagOrder": {
            "type": "integer"
          },
          "ReviewTranslationEnabled": {
            "type": "boolean"
          },
          "ReviewTranslationServer": {
            "type": "boolean"
          },
          "ReviewsExpandedByDefault": {
            "type": "boolean"
          },
          "RuntimeTagOrder": {
            "type": "integer"
          },
          "SeriesQualityAggregation": {
            "type": "string"
          },
          "ShokoConfigured": {
            "type": "boolean"
          },
          "Shortcuts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Shortcut"
            }
          },
          "ShowAnilistReviews": {
            "type": "boolean"
          },
          "ShowArrLinksAsText": {
            "type": "boolean"
          },
          "ShowAspectRatioTag": {
            "type": "boolean"
          },
          "ShowAudioInfoTag": {
            "type": "boolean"
          },
          "ShowAudioLanguages": {
            "type": "boolean"
          },
          "ShowAwards": {
            "type": "boolean"
          },
          "ShowCollectionsInSearch": {
            "type": "boolean"
          },
          "ShowDownloadsInRequests": {
            "type": "boolean"
          },
          "ShowDynamicRangeTag": {
            "type": "boolean"
          },
          "ShowEditionTag": {
            "type": "boolean"
          },
          "ShowElsewhereOnJellyseerr": {
            "type": "boolean"
          },
          "ShowFileSizes": {
            "type": "boolean"
          },
          "ShowFrameRateTag": {
            "type": "boolean"
          },
          "ShowLetterboxdLinkAsText": {
            "type": "boolean"
          },
          "ShowLowQualitySourceTag": {
            "type": "boolean"
          },
          "ShowPlaybackRatingBadge": {
            "type": "boolean"
          },
          "ShowRatingInPlayer": {
            "type": "boolean"
          },
          "ShowReleaseDates": {
            "type": "boolean"
          },
          "ShowResolutionTag": {
            "type": "boolean"
          },
          "ShowReviews": {
            "type": "boolean"
          },
          "ShowRuntimeTag": {
            "type": "boolean"
          },
          "ShowSourceTag": {
            "type": "boolean"
          },
          "ShowSpecialFormatTag": {
            "type": "boolean"
          },
          "ShowUserRatingDash": {
            "type": "boolean"
          },
          "ShowUserRatingOnPosters": {
            "type": "boolean"
          },
          "ShowUserReviews": {
            "type": "boolean"
          },
          "ShowVersionsTag": {
            "type": "boolean"
          },
          "ShowVideoCodecTag": {
            "type": "boolean"
          },
          "ShowWatchProgress": {
            "type": "boolean"
          },
          "SourceTagOrder": {
            "type": "integer"
          },
          "SpecialFormatTagOrder": {
            "type": "integer"
          },
          "SplashScreenImageUrl": {
            "type": "string"
          },
          "SpoilerAdvancedMode": {
            "type": "boolean"
          },
          "SpoilerBlurEnabled": {
            "type": "boolean"
          },
          "SpoilerBlurIntensity": {
            "type": "integer"
          },
          "SpoilerBlurStrictRefresh": {
            "type": "boolean"
          },
          "SpoilerBlurTrickplay": {
            "type": "boolean"
          },
          "SpoilerReplaceTitle": {
            "type": "boolean"
          },
          "SpoilerStripCast": {
            "type": "boolean"
          },
          "SpoilerStripChapters": {
            "type": "boolean"
          },
          "SpoilerStripOverview": {
            "type": "boolean"
          },
          "SpoilerStripPremiereDate": {
            "type": "boolean"
          },
          "SpoilerStripRatings": {
            "type": "boolean"
          },
          "SpoilerStripReviews": {
            "type": "boolean"
          },
          "SpoilerStripSeriesOverview": {
            "type": "boolean"
          },
          "SpoilerStripTaglines": {
            "type": "boolean"
          },
          "SpoilerStripTags": {
            "type": "boolean"
          },
          "StatusTagsDirectPlay": {
            "type": "boolean"
          },
          "StatusTagsEnabled": {
            "type": "boolean"
          },
          "StatusTagsJustAdded": {
            "type": "boolean"
          },
          "StatusTagsJustAddedDays": {
            "type": "integer"
          },
          "StatusTagsLeaving": {
            "type": "boolean"
          },
          "StatusTagsMilestones": {
            "type": "boolean"
          },
          "StatusTagsNewRelease": {
            "type": "boolean"
          },
          "StatusTagsNewReleaseDays": {
            "type": "integer"
          },
          "StatusTagsPosition": {
            "type": "string"
          },
          "StatusTagsScenes": {
            "type": "boolean"
          },
          "StatusTagsSchedule": {
            "type": "boolean"
          },
          "StatusTagsSeriesStatus": {
            "type": "boolean"
          },
          "StatusTagsTrending": {
            "type": "boolean"
          },
          "SyncJellyseerrWatchlist": {
            "type": "boolean"
          },
          "TagCacheServerMode": {
            "type": "boolean"
          },
          "TagEdgeSpacing": {
            "type": "string"
          },
          "TagGap": {
            "type": "string"
          },
          "TagGroupCaps": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupCaps"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupOrder": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupScopes": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupScopes"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLabelDensity": {
            "type": "string"
          },
          "TagLayout": {
            "type": "string"
          },
          "TagLayouts": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfiles"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLookItemOverrides": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLookItemOverride"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLookRules": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLookRule"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagScale": {
            "type": "string"
          },
          "TagShapeOverrides": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeOverrides"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagStylePreset": {
            "type": "string"
          },
          "TagStyleWebActive": {
            "type": "boolean"
          },
          "TagStylesAllowUserPreset": {
            "type": "boolean"
          },
          "TagsCacheTtlDays": {
            "type": "integer"
          },
          "TagsHideOnHover": {
            "type": "boolean"
          },
          "ThemeSelectorEnabled": {
            "type": "boolean"
          },
          "TmdbEnabled": {
            "type": "boolean"
          },
          "ToastDuration": {
            "type": "integer"
          },
          "UseIcons": {
            "type": "boolean"
          },
          "VersionsTagOrder": {
            "type": "integer"
          },
          "VideoCodecTagOrder": {
            "type": "integer"
          },
          "WatchProgressDefaultMode": {
            "type": "string"
          },
          "WatchProgressTimeFormat": {
            "type": "string"
          }
        },
        "required": [
          "ActiveStreamsAllUsers",
          "ActiveStreamsEnabled",
          "ActivityFeedEnabled",
          "ActivityFeedShowActiveStreams",
          "ActivityFeedShowFavorited",
          "ActivityFeedShowReviewed",
          "ActivityFeedShowWatched",
          "ActivityFeedUseCustomTabs",
          "ActivityFeedUseNativeTab",
          "AddRequestedMediaToWatchlist",
          "AgeRatingTagsEnabled",
          "AgeRatingTagsPosition",
          "AnalyticsEnabled",
          "AnalyticsShareUsageCounts",
          "ArrLinksEnabled",
          "ArrLinksShowStatusSingle",
          "ArrTagsLinksFilter",
          "ArrTagsLinksHideFilter",
          "ArrTagsPrefix",
          "ArrTagsShowAsLinks",
          "ArrTagsSyncEnabled",
          "AspectRatioTagOrder",
          "AudioInfoTagOrder",
          "AudioLanguageTagPrefix",
          "AudioLanguageTagShowAsLinks",
          "AudioLanguageTagSyncEnabled",
          "AutoPauseEnabled",
          "AutoPipEnabled",
          "AutoResumeEnabled",
          "AutoSkipIntro",
          "AutoSkipOutro",
          "AwardsTagsCertifiedFresh",
          "AwardsTagsEmmy",
          "AwardsTagsEnabled",
          "AwardsTagsImdb",
          "AwardsTagsLetterboxd",
          "AwardsTagsOscar",
          "AwardsTagsPosition",
          "BookmarksEnabled",
          "BookmarksUseCustomTabs",
          "BookmarksUseNativeTab",
          "BookmarksUsePluginPages",
          "CalendarFilterByLibraryAccess",
          "CalendarFirstDayOfWeek",
          "CalendarForceOnlyRequested",
          "CalendarHighlightFavorites",
          "CalendarHighlightWatchedSeries",
          "CalendarPageEnabled",
          "CalendarShowOnlyRequested",
          "CalendarTimeFormat",
          "CalendarUseCustomTabs",
          "CalendarUseNativeTab",
          "CalendarUsePluginPages",
          "CatchUpEnabled",
          "CatchUpUseCustomTabs",
          "CatchUpUseNativeTab",
          "CatchUpUsePluginPages",
          "ClearLocalStorageTimestamp",
          "ClearTranslationCacheTimestamp",
          "ColoredActivityIconsEnabled",
          "ColoredRatingsEnabled",
          "CustomTagRules",
          "CustomTagsEnabled",
          "CustomTagsPosition",
          "DEFAULT_PROVIDERS",
          "DEFAULT_REGION",
          "DefaultLanguage",
          "DefaultSubtitleFont",
          "DefaultSubtitleSize",
          "DefaultSubtitleStyle",
          "DefaultSubtitleTextEffect",
          "DisableAllShortcuts",
          "DisableCustomSubtitleStyles",
          "DisableTagsOnSearchPage",
          "DoesTheDogDieEnabled",
          "DownloadsFilterByUserRequests",
          "DownloadsHistoryAdminOnly",
          "DownloadsPageEnabled",
          "DownloadsPagePollingEnabled",
          "DownloadsPageShowIssues",
          "DownloadsPollIntervalSeconds",
          "DownloadsShowHistory",
          "DownloadsUseCustomTabs",
          "DownloadsUseNativeTab",
          "DownloadsUsePluginPages",
          "DynamicRangeTagOrder",
          "EditionTagOrder",
          "ElsewhereCustomBrandingImageUrl",
          "ElsewhereCustomBrandingText",
          "ElsewhereEnabled",
          "ElsewhereSeasonProviders",
          "EnableCustomSplashScreen",
          "EnableLoginImage",
          "EnableTagsLocalStorageFallback",
          "FrameRateTagOrder",
          "GenreTagsEnabled",
          "GenreTagsPosition",
          "HelpPanelAutocloseDelay",
          "HiddenContentAdmin",
          "HiddenContentEnabled",
          "HiddenContentUseCustomTabs",
          "HiddenContentUseNativeTab",
          "HiddenContentUsePluginPages",
          "HideReviewsFromDisabledUsers",
          "HideReviewsFromHiddenUsers",
          "IGNORE_PROVIDERS",
          "IconStyle",
          "JellyseerrAutoImportUsers",
          "JellyseerrAvailablePosterLinksToJellyfin",
          "JellyseerrBaseUrl",
          "JellyseerrDisableCache",
          "JellyseerrEnable4KRequests",
          "JellyseerrEnable4KTvRequests",
          "JellyseerrEnabled",
          "JellyseerrExcludeBlocklistedItems",
          "JellyseerrExcludeLibraryItems",
          "JellyseerrSearchExcludeLibraryItems",
          "JellyseerrShowAdvanced",
          "JellyseerrShowCollectionDiscovery",
          "JellyseerrShowDetailPageLink",
          "JellyseerrShowDetailPageLinkAsText",
          "JellyseerrShowGenreDiscovery",
          "JellyseerrShowIssueIndicator",
          "JellyseerrShowNetworkDiscovery",
          "JellyseerrShowPersonDiscovery",
          "JellyseerrShowQuotaInfo",
          "JellyseerrShowRecommended",
          "JellyseerrShowReportButton",
          "JellyseerrShowRequestMoreOnSeries",
          "JellyseerrShowSearchResults",
          "JellyseerrShowSimilar",
          "JellyseerrShowTagDiscovery",
          "JellyseerrSingleSeasonRequestOnly",
          "JellyseerrUrlMappings",
          "JellyseerrUseMoreInfoModal",
          "LanguageTagsCountBadge",
          "LanguageTagsEnabled",
          "LanguageTagsMergeRegions",
          "LanguageTagsPosition",
          "LanguageTagsPriority",
          "LanguageTagsPriorityStrict",
          "LanguageTagsShowAudio",
          "LanguageTagsShowSubtitles",
          "LanguageTagsStyle",
          "LeavingSoonAvailable",
          "LetterboxdEnabled",
          "LogoTagsEnabled",
          "LogoTagsMaxLogos",
          "LogoTagsMovieMode",
          "LogoTagsPosition",
          "LogoTagsSeriesMode",
          "LongPress2xEnabled",
          "MaintenanceModeAction",
          "MaintenanceModeAffectedUsers",
          "MaintenanceModeEnabled",
          "MaintenanceModeEndsAt",
          "MaintenanceModeMessage",
          "MdblistEnabled",
          "MdblistRatingsEnabled",
          "MdblistRatingsShowOnItemDetails",
          "MdblistRatingsShowPercentSymbol",
          "MdblistRatingsSources",
          "MetadataIconsEnabled",
          "NativePosterTagsEnabled",
          "PauseScreenDelaySeconds",
          "PauseScreenEnabled",
          "PeopleTagsEnabled",
          "PluginIconsEnabled",
          "QualityAudioDisplayMode",
          "QualityHdrDisplayMode",
          "QualityHideSdr",
          "QualityMinimumResolution",
          "QualityTagsAudioLanguageFromUser",
          "QualityTagsEnabled",
          "QualityTagsPosition",
          "QualityTagsPreferredAudioLanguage",
          "QualityVideoCodecDisplayMode",
          "RandomButtonEnabled",
          "RandomIncludeMovies",
          "RandomIncludeShows",
          "RandomScopeCurrentContainer",
          "RandomUnwatchedOnly",
          "RatingTagsColorByScore",
          "RatingTagsEnabled",
          "RatingTagsMinScore",
          "RatingTagsOnContinueWatching",
          "RatingTagsOnEpisodes",
          "RatingTagsOnMovies",
          "RatingTagsOnNextUp",
          "RatingTagsOnSeasons",
          "RatingTagsOnSeries",
          "RatingTagsPosition",
          "RatingTagsShowCommunity",
          "RatingTagsShowCritic",
          "RatingTagsSources",
          "RecommendationsPageEnabled",
          "RecommendationsUseCustomTabs",
          "RecommendationsUseNativeTab",
          "RemoveContinueWatchingEnabled",
          "ResolutionTagOrder",
          "ReviewTranslationEnabled",
          "ReviewTranslationServer",
          "ReviewsExpandedByDefault",
          "RuntimeTagOrder",
          "SeriesQualityAggregation",
          "ShokoConfigured",
          "Shortcuts",
          "ShowAnilistReviews",
          "ShowArrLinksAsText",
          "ShowAspectRatioTag",
          "ShowAudioInfoTag",
          "ShowAudioLanguages",
          "ShowAwards",
          "ShowCollectionsInSearch",
          "ShowDownloadsInRequests",
          "ShowDynamicRangeTag",
          "ShowEditionTag",
          "ShowElsewhereOnJellyseerr",
          "ShowFileSizes",
          "ShowFrameRateTag",
          "ShowLetterboxdLinkAsText",
          "ShowLowQualitySourceTag",
          "ShowPlaybackRatingBadge",
          "ShowRatingInPlayer",
          "ShowReleaseDates",
          "ShowResolutionTag",
          "ShowReviews",
          "ShowRuntimeTag",
          "ShowSourceTag",
          "ShowSpecialFormatTag",
          "ShowUserRatingDash",
          "ShowUserRatingOnPosters",
          "ShowUserReviews",
          "ShowVersionsTag",
          "ShowVideoCodecTag",
          "ShowWatchProgress",
          "SourceTagOrder",
          "SpecialFormatTagOrder",
          "SplashScreenImageUrl",
          "SpoilerAdvancedMode",
          "SpoilerBlurEnabled",
          "SpoilerBlurIntensity",
          "SpoilerBlurStrictRefresh",
          "SpoilerBlurTrickplay",
          "SpoilerReplaceTitle",
          "SpoilerStripCast",
          "SpoilerStripChapters",
          "SpoilerStripOverview",
          "SpoilerStripPremiereDate",
          "SpoilerStripRatings",
          "SpoilerStripReviews",
          "SpoilerStripSeriesOverview",
          "SpoilerStripTaglines",
          "SpoilerStripTags",
          "StatusTagsDirectPlay",
          "StatusTagsEnabled",
          "StatusTagsJustAdded",
          "StatusTagsJustAddedDays",
          "StatusTagsLeaving",
          "StatusTagsMilestones",
          "StatusTagsNewRelease",
          "StatusTagsNewReleaseDays",
          "StatusTagsPosition",
          "StatusTagsScenes",
          "StatusTagsSchedule",
          "StatusTagsSeriesStatus",
          "StatusTagsTrending",
          "SyncJellyseerrWatchlist",
          "TagCacheServerMode",
          "TagEdgeSpacing",
          "TagGap",
          "TagGroupCaps",
          "TagGroupOrder",
          "TagGroupScopes",
          "TagLabelDensity",
          "TagLayout",
          "TagLayouts",
          "TagLookItemOverrides",
          "TagLookRules",
          "TagScale",
          "TagShapeOverrides",
          "TagStylePreset",
          "TagStyleWebActive",
          "TagStylesAllowUserPreset",
          "TagsCacheTtlDays",
          "TagsHideOnHover",
          "ThemeSelectorEnabled",
          "TmdbEnabled",
          "ToastDuration",
          "UseIcons",
          "VersionsTagOrder",
          "VideoCodecTagOrder",
          "WatchProgressDefaultMode",
          "WatchProgressTimeFormat"
        ],
        "additionalProperties": false
      },
      "BookmarkItem": {
        "type": "object",
        "properties": {
          "CreatedAt": {
            "type": "string"
          },
          "EpisodeNumber": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "ItemId": {
            "type": "string"
          },
          "Label": {
            "type": "string"
          },
          "MediaType": {
            "type": "string"
          },
          "Name": {
            "type": "string"
          },
          "SeasonNumber": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "SyncedFrom": {
            "type": "string"
          },
          "Timestamp": {
            "type": "number"
          },
          "TmdbId": {
            "type": "string"
          },
          "TvdbId": {
            "type": "string"
          },
          "UpdatedAt": {
            "type": "string"
          }
        },
        "required": [
          "CreatedAt",
          "EpisodeNumber",
          "ItemId",
          "Label",
          "MediaType",
          "Name",
          "SeasonNumber",
          "SyncedFrom",
          "Timestamp",
          "TmdbId",
          "TvdbId",
          "UpdatedAt"
        ],
        "additionalProperties": false
      },
      "UserBookmark": {
        "type": "object",
        "properties": {
          "Bookmarks": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/$defs/BookmarkItem"
            }
          }
        },
        "required": [
          "Bookmarks"
        ],
        "additionalProperties": false
      },
      "BookmarkDocumentResponse": {
        "type": "object",
        "properties": {
          "Document": {
            "type": "string"
          },
          "Revision": {
            "type": "string"
          }
        },
        "required": [
          "Document",
          "Revision"
        ],
        "additionalProperties": false
      },
      "ElsewhereSettings": {
        "type": "object",
        "properties": {
          "Region": {
            "type": "string"
          },
          "Regions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "SeasonProviders": {
            "type": "boolean"
          },
          "Services": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "Region",
          "Regions",
          "SeasonProviders",
          "Services"
        ],
        "additionalProperties": false
      },
      "HiddenContentItem": {
        "type": "object",
        "properties": {
          "EpisodeNumber": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "HiddenAt": {
            "type": "string"
          },
          "HideScope": {
            "type": "string"
          },
          "ItemId": {
            "type": "string"
          },
          "Name": {
            "type": "string"
          },
          "PosterPath": {
            "type": "string"
          },
          "SeasonNumber": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "SeriesId": {
            "type": "string"
          },
          "SeriesName": {
            "type": "string"
          },
          "TmdbId": {
            "type": "string"
          },
          "Type": {
            "type": "string"
          }
        },
        "required": [
          "EpisodeNumber",
          "HiddenAt",
          "HideScope",
          "ItemId",
          "Name",
          "PosterPath",
          "SeasonNumber",
          "SeriesId",
          "SeriesName",
          "TmdbId",
          "Type"
        ],
        "additionalProperties": false
      },
      "HiddenContentSettings": {
        "type": "object",
        "properties": {
          "Enabled": {
            "type": "boolean"
          },
          "ExperimentalHideCollections": {
            "type": "boolean"
          },
          "FilterCalendar": {
            "type": "boolean"
          },
          "FilterContinueWatching": {
            "type": "boolean"
          },
          "FilterDiscovery": {
            "type": "boolean"
          },
          "FilterLibrary": {
            "type": "boolean"
          },
          "FilterNextUp": {
            "type": "boolean"
          },
          "FilterRecommendations": {
            "type": "boolean"
          },
          "FilterRequests": {
            "type": "boolean"
          },
          "FilterSearch": {
            "type": "boolean"
          },
          "FilterUpcoming": {
            "type": "boolean"
          },
          "ShowButtonCast": {
            "type": "boolean"
          },
          "ShowButtonDetails": {
            "type": "boolean"
          },
          "ShowButtonJellyseerr": {
            "type": "boolean"
          },
          "ShowButtonLibrary": {
            "type": "boolean"
          },
          "ShowHideButtons": {
            "type": "boolean"
          },
          "ShowHideConfirmation": {
            "type": "boolean"
          }
        },
        "required": [
          "Enabled",
          "ExperimentalHideCollections",
          "FilterCalendar",
          "FilterContinueWatching",
          "FilterDiscovery",
          "FilterLibrary",
          "FilterNextUp",
          "FilterRecommendations",
          "FilterRequests",
          "FilterSearch",
          "FilterUpcoming",
          "ShowButtonCast",
          "ShowButtonDetails",
          "ShowButtonJellyseerr",
          "ShowButtonLibrary",
          "ShowHideButtons",
          "ShowHideConfirmation"
        ],
        "additionalProperties": false
      },
      "UserHiddenContent": {
        "type": "object",
        "properties": {
          "Items": {
            "type": "object",
            "additionalProperties": {
              "$ref": "#/$defs/HiddenContentItem"
            }
          },
          "Settings": {
            "$ref": "#/$defs/HiddenContentSettings"
          }
        },
        "required": [
          "Items",
          "Settings"
        ],
        "additionalProperties": false
      },
      "TagLayoutLock": {
        "type": "object",
        "properties": {
          "Caps": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupCaps"
              },
              {
                "type": "null"
              }
            ]
          },
          "ColourPreset": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Density": {
            "type": "string"
          },
          "EdgeSpacing": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Layout": {
            "type": "string"
          },
          "LockedAt": {
            "type": "integer"
          },
          "Scope": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Shapes": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeOverrides"
              },
              {
                "type": "null"
              }
            ]
          },
          "Slots": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLayoutGroupSlot"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGap": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagScale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "Caps",
          "ColourPreset",
          "Density",
          "EdgeSpacing",
          "Layout",
          "LockedAt",
          "Scope",
          "Shapes",
          "Slots",
          "TagGap",
          "TagScale"
        ],
        "additionalProperties": false
      },
      "BootstrapSettings": {
        "type": "object",
        "properties": {
          "AgeRatingTagsEnabled": {
            "type": "boolean"
          },
          "AgeRatingTagsPosition": {
            "type": "string"
          },
          "AspectRatioTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "AudioInfoTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "AutoPauseEnabled": {
            "type": "boolean"
          },
          "AutoPipEnabled": {
            "type": "boolean"
          },
          "AutoResumeEnabled": {
            "type": "boolean"
          },
          "AutoSkipIntro": {
            "type": "boolean"
          },
          "AutoSkipOutro": {
            "type": "boolean"
          },
          "AwardsTagsEnabled": {
            "type": "boolean"
          },
          "AwardsTagsPosition": {
            "type": "string"
          },
          "CalendarDefaultViewMode": {
            "type": "string"
          },
          "CalendarDisplayMode": {
            "type": "string"
          },
          "CustomSubtitleBgColor": {
            "type": "string"
          },
          "CustomSubtitleTextColor": {
            "type": "string"
          },
          "CustomTagsEnabled": {
            "type": "boolean"
          },
          "CustomTagsPosition": {
            "type": "string"
          },
          "DisableCustomSubtitleStyles": {
            "type": "boolean"
          },
          "DisplayLanguage": {
            "type": "string"
          },
          "DynamicRangeTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "EditionTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "FrameRateTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "GenreTagsEnabled": {
            "type": "boolean"
          },
          "GenreTagsPosition": {
            "type": "string"
          },
          "IsAdmin": {
            "type": "boolean"
          },
          "LanguageTagsCountBadge": {
            "type": "string"
          },
          "LanguageTagsEnabled": {
            "type": "boolean"
          },
          "LanguageTagsPosition": {
            "type": "string"
          },
          "LanguageTagsPriority": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "LanguageTagsPriorityStrict": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "LanguageTagsShowAudio": {
            "type": "boolean"
          },
          "LanguageTagsShowSubtitles": {
            "type": "boolean"
          },
          "LanguageTagsStyle": {
            "type": "string"
          },
          "LastOpenedTab": {
            "type": "string"
          },
          "LogoTagsEnabled": {
            "type": "boolean"
          },
          "LogoTagsPosition": {
            "type": "string"
          },
          "LongPress2xEnabled": {
            "type": "boolean"
          },
          "NativePosterDateLocale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "NativePosterTimeZone": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "PauseScreenDelaySeconds": {
            "type": "integer"
          },
          "PauseScreenEnabled": {
            "type": "boolean"
          },
          "PeopleTagsEnabled": {
            "type": "boolean"
          },
          "QualityAudioDisplayMode": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityHdrDisplayMode": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityHideSdr": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityMinimumResolution": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityTagsEnabled": {
            "type": "boolean"
          },
          "QualityTagsPosition": {
            "type": "string"
          },
          "QualityTagsPreferredAudioLanguage": {
            "type": "string"
          },
          "QualityVideoCodecDisplayMode": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "RandomButtonEnabled": {
            "type": "boolean"
          },
          "RandomIncludeMovies": {
            "type": "boolean"
          },
          "RandomIncludeShows": {
            "type": "boolean"
          },
          "RandomScopeCurrentContainer": {
            "type": "boolean"
          },
          "RandomSourceId": {
            "type": "string"
          },
          "RandomUnwatchedOnly": {
            "type": "boolean"
          },
          "RatingTagsColorByScore": {
            "type": "boolean"
          },
          "RatingTagsEnabled": {
            "type": "boolean"
          },
          "RatingTagsMinScore": {
            "type": "number"
          },
          "RatingTagsOnContinueWatching": {
            "type": "boolean"
          },
          "RatingTagsOnEpisodes": {
            "type": "boolean"
          },
          "RatingTagsOnMovies": {
            "type": "boolean"
          },
          "RatingTagsOnNextUp": {
            "type": "boolean"
          },
          "RatingTagsOnSeasons": {
            "type": "boolean"
          },
          "RatingTagsOnSeries": {
            "type": "boolean"
          },
          "RatingTagsPosition": {
            "type": "string"
          },
          "RatingTagsShowCommunity": {
            "type": "boolean"
          },
          "RatingTagsShowCritic": {
            "type": "boolean"
          },
          "RatingTagsSources": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "RemoveContinueWatchingEnabled": {
            "type": "boolean"
          },
          "ResolutionTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "ReviewsExpandedByDefault": {
            "type": "boolean"
          },
          "RuntimeTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "SelectedFontFamilyPresetIndex": {
            "type": "integer"
          },
          "SelectedFontSizePresetIndex": {
            "type": "integer"
          },
          "SelectedStylePresetIndex": {
            "type": "integer"
          },
          "SelectedTextEffectPresetIndex": {
            "type": "integer"
          },
          "SeriesQualityAggregation": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowAspectRatioTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowAudioInfoTag": {
            "type": "boolean"
          },
          "ShowAudioLanguages": {
            "type": "boolean"
          },
          "ShowDynamicRangeTag": {
            "type": "boolean"
          },
          "ShowEditionTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowFileSizes": {
            "type": "boolean"
          },
          "ShowFrameRateTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowLowQualitySourceTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowRatingInPlayer": {
            "type": "boolean"
          },
          "ShowResolutionTag": {
            "type": "boolean"
          },
          "ShowRuntimeTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowSourceTag": {
            "type": "boolean"
          },
          "ShowSpecialFormatTag": {
            "type": "boolean"
          },
          "ShowVersionsTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowVideoCodecTag": {
            "type": "boolean"
          },
          "ShowWatchProgress": {
            "type": "boolean"
          },
          "SourceTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "SpecialFormatTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "StatusTagsDirectPlay": {
            "type": "boolean"
          },
          "StatusTagsEnabled": {
            "type": "boolean"
          },
          "StatusTagsJustAdded": {
            "type": "boolean"
          },
          "StatusTagsLeaving": {
            "type": "boolean"
          },
          "StatusTagsMilestones": {
            "type": "boolean"
          },
          "StatusTagsNewRelease": {
            "type": "boolean"
          },
          "StatusTagsPosition": {
            "type": "string"
          },
          "StatusTagsScenes": {
            "type": "boolean"
          },
          "StatusTagsSchedule": {
            "type": "boolean"
          },
          "StatusTagsSeriesStatus": {
            "type": "boolean"
          },
          "StatusTagsTrending": {
            "type": "boolean"
          },
          "SubtitleHorizontalPosition": {
            "type": "integer"
          },
          "SubtitleVerticalPosition": {
            "type": "integer"
          },
          "TagEdgeSpacing": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGap": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupCaps": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupCaps"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupOrder": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupScopes": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupScopes"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLabelDensity": {
            "type": "string"
          },
          "TagLayout": {
            "type": "string"
          },
          "TagLayoutLocks": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": {
                  "$ref": "#/$defs/TagLayoutLock"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLayoutSettingsVersion": {
            "type": "integer"
          },
          "TagLayouts": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfiles"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLookRules": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLookRule"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagScale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagShapeOverrides": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeOverrides"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagStylePreset": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagsHideOnHover": {
            "type": "boolean"
          },
          "UseNativePosterTags": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "UsingCustomColors": {
            "type": "boolean"
          },
          "VersionsTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "VideoCodecTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "WatchProgressMode": {
            "type": "string"
          },
          "WatchProgressTimeFormat": {
            "type": "string"
          }
        },
        "required": [
          "AgeRatingTagsEnabled",
          "AgeRatingTagsPosition",
          "AspectRatioTagOrder",
          "AudioInfoTagOrder",
          "AutoPauseEnabled",
          "AutoPipEnabled",
          "AutoResumeEnabled",
          "AutoSkipIntro",
          "AutoSkipOutro",
          "AwardsTagsEnabled",
          "AwardsTagsPosition",
          "CalendarDefaultViewMode",
          "CalendarDisplayMode",
          "CustomSubtitleBgColor",
          "CustomSubtitleTextColor",
          "CustomTagsEnabled",
          "CustomTagsPosition",
          "DisableCustomSubtitleStyles",
          "DisplayLanguage",
          "DynamicRangeTagOrder",
          "EditionTagOrder",
          "FrameRateTagOrder",
          "GenreTagsEnabled",
          "GenreTagsPosition",
          "IsAdmin",
          "LanguageTagsCountBadge",
          "LanguageTagsEnabled",
          "LanguageTagsPosition",
          "LanguageTagsPriority",
          "LanguageTagsPriorityStrict",
          "LanguageTagsShowAudio",
          "LanguageTagsShowSubtitles",
          "LanguageTagsStyle",
          "LastOpenedTab",
          "LogoTagsEnabled",
          "LogoTagsPosition",
          "LongPress2xEnabled",
          "NativePosterDateLocale",
          "NativePosterTimeZone",
          "PauseScreenDelaySeconds",
          "PauseScreenEnabled",
          "PeopleTagsEnabled",
          "QualityAudioDisplayMode",
          "QualityHdrDisplayMode",
          "QualityHideSdr",
          "QualityMinimumResolution",
          "QualityTagsEnabled",
          "QualityTagsPosition",
          "QualityTagsPreferredAudioLanguage",
          "QualityVideoCodecDisplayMode",
          "RandomButtonEnabled",
          "RandomIncludeMovies",
          "RandomIncludeShows",
          "RandomScopeCurrentContainer",
          "RandomSourceId",
          "RandomUnwatchedOnly",
          "RatingTagsColorByScore",
          "RatingTagsEnabled",
          "RatingTagsMinScore",
          "RatingTagsOnContinueWatching",
          "RatingTagsOnEpisodes",
          "RatingTagsOnMovies",
          "RatingTagsOnNextUp",
          "RatingTagsOnSeasons",
          "RatingTagsOnSeries",
          "RatingTagsPosition",
          "RatingTagsShowCommunity",
          "RatingTagsShowCritic",
          "RatingTagsSources",
          "RemoveContinueWatchingEnabled",
          "ResolutionTagOrder",
          "ReviewsExpandedByDefault",
          "RuntimeTagOrder",
          "SelectedFontFamilyPresetIndex",
          "SelectedFontSizePresetIndex",
          "SelectedStylePresetIndex",
          "SelectedTextEffectPresetIndex",
          "SeriesQualityAggregation",
          "ShowAspectRatioTag",
          "ShowAudioInfoTag",
          "ShowAudioLanguages",
          "ShowDynamicRangeTag",
          "ShowEditionTag",
          "ShowFileSizes",
          "ShowFrameRateTag",
          "ShowLowQualitySourceTag",
          "ShowRatingInPlayer",
          "ShowResolutionTag",
          "ShowRuntimeTag",
          "ShowSourceTag",
          "ShowSpecialFormatTag",
          "ShowVersionsTag",
          "ShowVideoCodecTag",
          "ShowWatchProgress",
          "SourceTagOrder",
          "SpecialFormatTagOrder",
          "StatusTagsDirectPlay",
          "StatusTagsEnabled",
          "StatusTagsJustAdded",
          "StatusTagsLeaving",
          "StatusTagsMilestones",
          "StatusTagsNewRelease",
          "StatusTagsPosition",
          "StatusTagsScenes",
          "StatusTagsSchedule",
          "StatusTagsSeriesStatus",
          "StatusTagsTrending",
          "SubtitleHorizontalPosition",
          "SubtitleVerticalPosition",
          "TagEdgeSpacing",
          "TagGap",
          "TagGroupCaps",
          "TagGroupOrder",
          "TagGroupScopes",
          "TagLabelDensity",
          "TagLayout",
          "TagLayoutLocks",
          "TagLayoutSettingsVersion",
          "TagLayouts",
          "TagLookRules",
          "TagScale",
          "TagShapeOverrides",
          "TagStylePreset",
          "TagsHideOnHover",
          "UseNativePosterTags",
          "UsingCustomColors",
          "VersionsTagOrder",
          "VideoCodecTagOrder",
          "WatchProgressMode",
          "WatchProgressTimeFormat"
        ],
        "additionalProperties": false
      },
      "UserShortcuts": {
        "type": "object",
        "properties": {
          "Shortcuts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Shortcut"
            }
          }
        },
        "required": [
          "Shortcuts"
        ],
        "additionalProperties": false
      },
      "BootstrapUserDocuments": {
        "type": "object",
        "properties": {
          "Bookmark": {
            "anyOf": [
              {
                "$ref": "#/$defs/UserBookmark"
              },
              {
                "type": "null"
              }
            ]
          },
          "BookmarkSnapshot": {
            "anyOf": [
              {
                "$ref": "#/$defs/BookmarkDocumentResponse"
              },
              {
                "type": "null"
              }
            ]
          },
          "Elsewhere": {
            "anyOf": [
              {
                "$ref": "#/$defs/ElsewhereSettings"
              },
              {
                "type": "null"
              }
            ]
          },
          "HiddenContent": {
            "anyOf": [
              {
                "$ref": "#/$defs/UserHiddenContent"
              },
              {
                "type": "null"
              }
            ]
          },
          "Settings": {
            "anyOf": [
              {
                "$ref": "#/$defs/BootstrapSettings"
              },
              {
                "type": "null"
              }
            ]
          },
          "SettingsRevision": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Shortcuts": {
            "anyOf": [
              {
                "$ref": "#/$defs/UserShortcuts"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "Bookmark",
          "Elsewhere",
          "HiddenContent",
          "Settings",
          "SettingsRevision",
          "Shortcuts"
        ],
        "additionalProperties": false
      },
      "BootstrapResponse": {
        "type": "object",
        "properties": {
          "ComponentScripts": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "HasCustomTabs": {
            "type": "boolean"
          },
          "HasPluginPages": {
            "type": "boolean"
          },
          "Prefetched": {
            "$ref": "#/$defs/BootstrapPrefetched"
          },
          "PrivateConfig": {
            "anyOf": [
              {
                "$ref": "#/$defs/BootstrapPrivateConfig"
              },
              {
                "type": "null"
              }
            ]
          },
          "PublicConfig": {
            "$ref": "#/$defs/BootstrapPublicConfig"
          },
          "UserId": {
            "type": "string"
          },
          "UserSettings": {
            "$ref": "#/$defs/BootstrapUserDocuments"
          },
          "Version": {
            "type": "string"
          }
        },
        "required": [
          "ComponentScripts",
          "HasCustomTabs",
          "HasPluginPages",
          "Prefetched",
          "PrivateConfig",
          "PublicConfig",
          "UserId",
          "UserSettings",
          "Version"
        ],
        "additionalProperties": false
      },
      "RevisionedSettingsResponse": {
        "type": "object",
        "properties": {
          "Revision": {
            "type": "string"
          },
          "Settings": {
            "$ref": "#/$defs/BootstrapSettings"
          }
        },
        "required": [
          "Revision",
          "Settings"
        ],
        "additionalProperties": false
      },
      "JellyfinEnhancedUserSettings": {
        "type": "object",
        "properties": {
          "AgeRatingTagsEnabled": {
            "type": "boolean"
          },
          "AgeRatingTagsPosition": {
            "type": "string"
          },
          "AspectRatioTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "AudioInfoTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "AutoPauseEnabled": {
            "type": "boolean"
          },
          "AutoPipEnabled": {
            "type": "boolean"
          },
          "AutoResumeEnabled": {
            "type": "boolean"
          },
          "AutoSkipIntro": {
            "type": "boolean"
          },
          "AutoSkipOutro": {
            "type": "boolean"
          },
          "AwardsTagsEnabled": {
            "type": "boolean"
          },
          "AwardsTagsPosition": {
            "type": "string"
          },
          "CalendarDefaultViewMode": {
            "type": "string"
          },
          "CalendarDisplayMode": {
            "type": "string"
          },
          "CustomSubtitleBgColor": {
            "type": "string"
          },
          "CustomSubtitleTextColor": {
            "type": "string"
          },
          "CustomTagsEnabled": {
            "type": "boolean"
          },
          "CustomTagsPosition": {
            "type": "string"
          },
          "DisableCustomSubtitleStyles": {
            "type": "boolean"
          },
          "DisplayLanguage": {
            "type": "string"
          },
          "DynamicRangeTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "EditionTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "FrameRateTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "GenreTagsEnabled": {
            "type": "boolean"
          },
          "GenreTagsPosition": {
            "type": "string"
          },
          "LanguageTagsCountBadge": {
            "type": "string"
          },
          "LanguageTagsEnabled": {
            "type": "boolean"
          },
          "LanguageTagsPosition": {
            "type": "string"
          },
          "LanguageTagsPriority": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "LanguageTagsPriorityStrict": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "LanguageTagsShowAudio": {
            "type": "boolean"
          },
          "LanguageTagsShowSubtitles": {
            "type": "boolean"
          },
          "LanguageTagsStyle": {
            "type": "string"
          },
          "LastOpenedTab": {
            "type": "string"
          },
          "LogoTagsEnabled": {
            "type": "boolean"
          },
          "LogoTagsPosition": {
            "type": "string"
          },
          "LongPress2xEnabled": {
            "type": "boolean"
          },
          "NativePosterDateLocale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "NativePosterTimeZone": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "PauseScreenDelaySeconds": {
            "type": "integer"
          },
          "PauseScreenEnabled": {
            "type": "boolean"
          },
          "PeopleTagsEnabled": {
            "type": "boolean"
          },
          "QualityAudioDisplayMode": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityHdrDisplayMode": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityHideSdr": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityMinimumResolution": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "QualityTagsEnabled": {
            "type": "boolean"
          },
          "QualityTagsPosition": {
            "type": "string"
          },
          "QualityTagsPreferredAudioLanguage": {
            "type": "string"
          },
          "QualityVideoCodecDisplayMode": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "RandomButtonEnabled": {
            "type": "boolean"
          },
          "RandomIncludeMovies": {
            "type": "boolean"
          },
          "RandomIncludeShows": {
            "type": "boolean"
          },
          "RandomScopeCurrentContainer": {
            "type": "boolean"
          },
          "RandomSourceId": {
            "type": "string"
          },
          "RandomUnwatchedOnly": {
            "type": "boolean"
          },
          "RatingTagsColorByScore": {
            "type": "boolean"
          },
          "RatingTagsEnabled": {
            "type": "boolean"
          },
          "RatingTagsMinScore": {
            "type": "number"
          },
          "RatingTagsOnContinueWatching": {
            "type": "boolean"
          },
          "RatingTagsOnEpisodes": {
            "type": "boolean"
          },
          "RatingTagsOnMovies": {
            "type": "boolean"
          },
          "RatingTagsOnNextUp": {
            "type": "boolean"
          },
          "RatingTagsOnSeasons": {
            "type": "boolean"
          },
          "RatingTagsOnSeries": {
            "type": "boolean"
          },
          "RatingTagsPosition": {
            "type": "string"
          },
          "RatingTagsShowCommunity": {
            "type": "boolean"
          },
          "RatingTagsShowCritic": {
            "type": "boolean"
          },
          "RatingTagsSources": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "RemoveContinueWatchingEnabled": {
            "type": "boolean"
          },
          "ResolutionTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "ReviewsExpandedByDefault": {
            "type": "boolean"
          },
          "RuntimeTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "SelectedFontFamilyPresetIndex": {
            "type": "integer"
          },
          "SelectedFontSizePresetIndex": {
            "type": "integer"
          },
          "SelectedStylePresetIndex": {
            "type": "integer"
          },
          "SelectedTextEffectPresetIndex": {
            "type": "integer"
          },
          "SeriesQualityAggregation": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowAspectRatioTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowAudioInfoTag": {
            "type": "boolean"
          },
          "ShowAudioLanguages": {
            "type": "boolean"
          },
          "ShowDynamicRangeTag": {
            "type": "boolean"
          },
          "ShowEditionTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowFileSizes": {
            "type": "boolean"
          },
          "ShowFrameRateTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowLowQualitySourceTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowRatingInPlayer": {
            "type": "boolean"
          },
          "ShowResolutionTag": {
            "type": "boolean"
          },
          "ShowRuntimeTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowSourceTag": {
            "type": "boolean"
          },
          "ShowSpecialFormatTag": {
            "type": "boolean"
          },
          "ShowVersionsTag": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "ShowVideoCodecTag": {
            "type": "boolean"
          },
          "ShowWatchProgress": {
            "type": "boolean"
          },
          "SourceTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "SpecialFormatTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "StatusTagsDirectPlay": {
            "type": "boolean"
          },
          "StatusTagsEnabled": {
            "type": "boolean"
          },
          "StatusTagsJustAdded": {
            "type": "boolean"
          },
          "StatusTagsLeaving": {
            "type": "boolean"
          },
          "StatusTagsMilestones": {
            "type": "boolean"
          },
          "StatusTagsNewRelease": {
            "type": "boolean"
          },
          "StatusTagsPosition": {
            "type": "string"
          },
          "StatusTagsScenes": {
            "type": "boolean"
          },
          "StatusTagsSchedule": {
            "type": "boolean"
          },
          "StatusTagsSeriesStatus": {
            "type": "boolean"
          },
          "StatusTagsTrending": {
            "type": "boolean"
          },
          "SubtitleHorizontalPosition": {
            "type": "integer"
          },
          "SubtitleVerticalPosition": {
            "type": "integer"
          },
          "TagEdgeSpacing": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGap": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupCaps": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupCaps"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupOrder": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagGroupScopes": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagGroupScopes"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLabelDensity": {
            "type": "string"
          },
          "TagLayout": {
            "type": "string"
          },
          "TagLayoutLocks": {
            "anyOf": [
              {
                "type": "object",
                "additionalProperties": {
                  "$ref": "#/$defs/TagLayoutLock"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLayoutSettingsVersion": {
            "type": "integer"
          },
          "TagLayouts": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagLayoutProfiles"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagLookRules": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/TagLookRule"
                }
              },
              {
                "type": "null"
              }
            ]
          },
          "TagScale": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagShapeOverrides": {
            "anyOf": [
              {
                "$ref": "#/$defs/TagShapeOverrides"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagStylePreset": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "TagsHideOnHover": {
            "type": "boolean"
          },
          "UseNativePosterTags": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "UsingCustomColors": {
            "type": "boolean"
          },
          "VersionsTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "VideoCodecTagOrder": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ]
          },
          "WatchProgressMode": {
            "type": "string"
          },
          "WatchProgressTimeFormat": {
            "type": "string"
          }
        },
        "required": [
          "AgeRatingTagsEnabled",
          "AgeRatingTagsPosition",
          "AspectRatioTagOrder",
          "AudioInfoTagOrder",
          "AutoPauseEnabled",
          "AutoPipEnabled",
          "AutoResumeEnabled",
          "AutoSkipIntro",
          "AutoSkipOutro",
          "AwardsTagsEnabled",
          "AwardsTagsPosition",
          "CalendarDefaultViewMode",
          "CalendarDisplayMode",
          "CustomSubtitleBgColor",
          "CustomSubtitleTextColor",
          "CustomTagsEnabled",
          "CustomTagsPosition",
          "DisableCustomSubtitleStyles",
          "DisplayLanguage",
          "DynamicRangeTagOrder",
          "EditionTagOrder",
          "FrameRateTagOrder",
          "GenreTagsEnabled",
          "GenreTagsPosition",
          "LanguageTagsCountBadge",
          "LanguageTagsEnabled",
          "LanguageTagsPosition",
          "LanguageTagsPriority",
          "LanguageTagsPriorityStrict",
          "LanguageTagsShowAudio",
          "LanguageTagsShowSubtitles",
          "LanguageTagsStyle",
          "LastOpenedTab",
          "LogoTagsEnabled",
          "LogoTagsPosition",
          "LongPress2xEnabled",
          "NativePosterDateLocale",
          "NativePosterTimeZone",
          "PauseScreenDelaySeconds",
          "PauseScreenEnabled",
          "PeopleTagsEnabled",
          "QualityAudioDisplayMode",
          "QualityHdrDisplayMode",
          "QualityHideSdr",
          "QualityMinimumResolution",
          "QualityTagsEnabled",
          "QualityTagsPosition",
          "QualityTagsPreferredAudioLanguage",
          "QualityVideoCodecDisplayMode",
          "RandomButtonEnabled",
          "RandomIncludeMovies",
          "RandomIncludeShows",
          "RandomScopeCurrentContainer",
          "RandomSourceId",
          "RandomUnwatchedOnly",
          "RatingTagsColorByScore",
          "RatingTagsEnabled",
          "RatingTagsMinScore",
          "RatingTagsOnContinueWatching",
          "RatingTagsOnEpisodes",
          "RatingTagsOnMovies",
          "RatingTagsOnNextUp",
          "RatingTagsOnSeasons",
          "RatingTagsOnSeries",
          "RatingTagsPosition",
          "RatingTagsShowCommunity",
          "RatingTagsShowCritic",
          "RatingTagsSources",
          "RemoveContinueWatchingEnabled",
          "ResolutionTagOrder",
          "ReviewsExpandedByDefault",
          "RuntimeTagOrder",
          "SelectedFontFamilyPresetIndex",
          "SelectedFontSizePresetIndex",
          "SelectedStylePresetIndex",
          "SelectedTextEffectPresetIndex",
          "SeriesQualityAggregation",
          "ShowAspectRatioTag",
          "ShowAudioInfoTag",
          "ShowAudioLanguages",
          "ShowDynamicRangeTag",
          "ShowEditionTag",
          "ShowFileSizes",
          "ShowFrameRateTag",
          "ShowLowQualitySourceTag",
          "ShowRatingInPlayer",
          "ShowResolutionTag",
          "ShowRuntimeTag",
          "ShowSourceTag",
          "ShowSpecialFormatTag",
          "ShowVersionsTag",
          "ShowVideoCodecTag",
          "ShowWatchProgress",
          "SourceTagOrder",
          "SpecialFormatTagOrder",
          "StatusTagsDirectPlay",
          "StatusTagsEnabled",
          "StatusTagsJustAdded",
          "StatusTagsLeaving",
          "StatusTagsMilestones",
          "StatusTagsNewRelease",
          "StatusTagsPosition",
          "StatusTagsScenes",
          "StatusTagsSchedule",
          "StatusTagsSeriesStatus",
          "StatusTagsTrending",
          "SubtitleHorizontalPosition",
          "SubtitleVerticalPosition",
          "TagEdgeSpacing",
          "TagGap",
          "TagGroupCaps",
          "TagGroupOrder",
          "TagGroupScopes",
          "TagLabelDensity",
          "TagLayout",
          "TagLayoutLocks",
          "TagLayoutSettingsVersion",
          "TagLayouts",
          "TagLookRules",
          "TagScale",
          "TagShapeOverrides",
          "TagStylePreset",
          "TagsHideOnHover",
          "UseNativePosterTags",
          "UsingCustomColors",
          "VersionsTagOrder",
          "VideoCodecTagOrder",
          "WatchProgressMode",
          "WatchProgressTimeFormat"
        ],
        "additionalProperties": false
      },
      "RevisionedSettingsRequest": {
        "type": "object",
        "properties": {
          "Revision": {
            "type": "string"
          },
          "Settings": {
            "$ref": "#/$defs/JellyfinEnhancedUserSettings"
          }
        },
        "required": [
          "Revision",
          "Settings"
        ],
        "additionalProperties": false
      },
      "SettingsSaveReceipt": {
        "type": "object",
        "properties": {
          "Revision": {
            "type": "string"
          }
        },
        "required": [
          "Revision"
        ],
        "additionalProperties": false
      },
      "BookmarkOperation": {
        "type": "object",
        "properties": {
          "ExpectedItemId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Fields": true,
          "Id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "Kind": {
            "type": "string"
          },
          "Offset": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ]
          },
          "SourceId": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "ExpectedItemId",
          "Fields",
          "Id",
          "Kind",
          "Offset",
          "SourceId"
        ],
        "additionalProperties": false
      },
      "BookmarkMutationRequest": {
        "type": "object",
        "properties": {
          "Operations": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/BookmarkOperation"
            }
          },
          "Revision": {
            "type": "string"
          }
        },
        "required": [
          "Operations",
          "Revision"
        ],
        "additionalProperties": false
      },
      "BookmarkSaveReceipt": {
        "type": "object",
        "properties": {
          "Revision": {
            "type": "string"
          }
        },
        "required": [
          "Revision"
        ],
        "additionalProperties": false
      }
    }
  };

  // client/src/contracts/validate.ts
  function validateSchema(value, schema, definitions) {
    const ancestors = /* @__PURE__ */ new Set();
    function json(value2, depth) {
      if (depth > 100) return false;
      if (value2 === null || typeof value2 === "string" || typeof value2 === "boolean") return true;
      if (typeof value2 === "number") return Number.isFinite(value2);
      if (typeof value2 !== "object" || ancestors.has(value2)) return false;
      ancestors.add(value2);
      const valid = Array.isArray(value2) ? value2.every((child) => json(child, depth + 1)) : Object.prototype.toString.call(value2) === "[object Object]" && Object.values(value2).every((child) => json(child, depth + 1));
      ancestors.delete(value2);
      return valid;
    }
    function matches(value2, rule, depth) {
      if (depth > 100) return false;
      if (typeof rule === "boolean") return rule;
      if (rule.$ref !== void 0) {
        const prefix = "#/$defs/";
        const target = rule.$ref.startsWith(prefix) ? definitions[rule.$ref.slice(prefix.length)] : void 0;
        return target !== void 0 && matches(value2, target, depth + 1);
      }
      if (rule.anyOf !== void 0) return rule.anyOf.some((option) => matches(value2, option, depth + 1));
      switch (rule.type) {
        case "null":
          return value2 === null;
        case "string":
          return typeof value2 === "string";
        case "boolean":
          return typeof value2 === "boolean";
        case "number":
          return typeof value2 === "number" && Number.isFinite(value2);
        case "integer":
          return typeof value2 === "number" && Number.isInteger(value2);
        case "array":
          return Array.isArray(value2) && rule.items !== void 0 && value2.every((item) => matches(item, rule.items, depth + 1));
        case "object": {
          if (value2 === null || typeof value2 !== "object" || Array.isArray(value2)) return false;
          if (rule.required?.some((key) => !Object.prototype.hasOwnProperty.call(value2, key))) return false;
          return Object.entries(value2).every(([key, child]) => {
            const property = rule.properties && Object.prototype.hasOwnProperty.call(rule.properties, key) ? rule.properties[key] : void 0;
            return matches(child, property ?? rule.additionalProperties ?? true, depth + 1);
          });
        }
        default:
          return false;
      }
    }
    return json(value, 0) && matches(value, schema, 0);
  }

  // client/src/host/context.ts
  function featureContext(feature, core, slots) {
    const own = {};
    const bind = (keys, target) => {
      for (const key of keys) {
        Object.defineProperty(own, key, {
          enumerable: true,
          get: () => target()[key],
          set: (value) => {
            target()[key] = value;
          }
        });
      }
    };
    bind(slots.facades ?? [], () => core);
    const internalsObject = slots.internalsObject;
    if (slots.internalSlots?.length) {
      if (!internalsObject) throw new Error(`${feature}: internal slots need the host's internalsObject accessor`);
      bind(slots.internalSlots, internalsObject);
    }
    return {
      feature,
      core,
      own,
      peer: (name) => core[name]
    };
  }

  // client/src/features/bookmarks/host.ts
  function bookmarksHost() {
    const host2 = window;
    const JE = host2.JellyfinEnhanced;
    if (!JE) throw new Error("Bookmarks loaded before Jellyfin Enhanced");
    const ctx2 = featureContext("bookmarks", JE, {
      facades: ["bookmarks", "initializeBookmarks", "cleanupBookmarks"],
      internalSlots: ["bookmarksLibrary", "bookmarkLifetimes"],
      internalsObject: () => JE.internals ?? (JE.internals = {})
    });
    const getApi2 = () => {
      const api = host2.ApiClient || host2.ConnectionManager?.currentApiClient();
      if (!api) throw new Error("API client not available");
      return api;
    };
    return { ctx: ctx2, host: host2, getApi: getApi2 };
  }
  function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function readItem(value) {
    if (!record(value) || typeof value.Id !== "string") throw new Error("Invalid item response");
    const text = (key) => typeof value[key] === "string" ? value[key] : void 0;
    const number = (key) => typeof value[key] === "number" && Number.isFinite(value[key]) ? value[key] : void 0;
    const providers = record(value.ProviderIds) ? value.ProviderIds : {};
    const tags = record(value.ImageTags) ? value.ImageTags : {};
    const user = record(value.UserData) ? value.UserData : {};
    return {
      Id: value.Id,
      Name: text("Name"),
      Type: text("Type"),
      SeriesId: text("SeriesId"),
      SeriesName: text("SeriesName"),
      ProductionYear: number("ProductionYear"),
      ParentIndexNumber: number("ParentIndexNumber"),
      IndexNumber: number("IndexNumber"),
      ProviderIds: { Tmdb: typeof providers.Tmdb === "string" ? providers.Tmdb : void 0, Tvdb: typeof providers.Tvdb === "string" ? providers.Tvdb : void 0 },
      ImageTags: { Primary: typeof tags.Primary === "string" ? tags.Primary : void 0 },
      UserData: { Key: typeof user.Key === "string" ? user.Key : void 0 }
    };
  }
  function readItems(value) {
    if (typeof value === "string") return readItems(JSON.parse(value));
    if (!record(value) || !Array.isArray(value.Items)) throw new Error("Invalid items response");
    return value.Items.map(readItem);
  }
  function lease(JE) {
    const owner = JE.userConfig, epoch = JE.session?.getEpoch();
    return () => JE.userConfig === owner && (epoch === void 0 || JE.session?.isCurrent(epoch) === true);
  }
  function isMissingItem(error) {
    return record(error) && (error.status === 404 || error.statusCode === 404) || record(error) && typeof error.message === "string" && /^404(?:\b|$)/.test(error.message);
  }
  function jsonValue(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(jsonValue);
    if (record(value)) return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== void 0).map(([k, v]) => [k, jsonValue(v)]));
    throw new Error("Invalid bookmark edit value");
  }
  function bookmarkOperation(Kind, Id, fields, ExpectedItemId) {
    return { Kind, Id: Id ?? null, SourceId: null, ExpectedItemId: ExpectedItemId ?? null, Offset: null, Fields: fields ? jsonValue(fields) : null };
  }
  function isReceipt(value) {
    return validateSchema(value, bootstrapSchema.$defs.BookmarkSaveReceipt, bootstrapSchema.$defs);
  }
  async function persistBookmarks(JE, getApi2, owner, Operations) {
    const api = getApi2(), userId = api.getCurrentUserId(), token = api.accessToken?.(), baseUrl = api.getUrl("/"), current = lease(JE);
    if (!current() || JE.userConfig !== owner || !userId) throw new Error("Bookmark owner changed before saving");
    const binding = owner.bookmarkBinding;
    if (binding && (binding.client !== api || binding.userId !== userId || binding.token !== token || binding.baseUrl !== baseUrl)) throw new Error("Bookmark identity changed. Reload before saving again.");
    if (!owner.bookmarkRevision) {
      JE.toast("Bookmarks were not loaded safely. Reload before saving again.", 5e3);
      throw new Error("Loaded bookmark revision required. Reload before saving again.");
    }
    try {
      const response = await api.ajax({
        type: "POST",
        url: api.getUrl(`/JellyfinEnhanced/user-settings/${userId}/bookmark-document`),
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify({ Revision: owner.bookmarkRevision, Operations })
      });
      if (!isReceipt(response) || !response.Revision) throw new Error("Invalid bookmark save receipt. Reload before saving again.");
      owner.bookmarkRevision = response.Revision;
    } catch (error) {
      if (current() && getApi2() === api && api.getCurrentUserId() === userId && api.accessToken?.() === token && api.getUrl("/") === baseUrl) {
        const conflict = record(error) && (error.status === 409 || error.statusCode === 409);
        if (conflict) window.setTimeout(() => {
          if (current() && getApi2() === api && api.getCurrentUserId() === userId && api.accessToken?.() === token && api.getUrl("/") === baseUrl)
            JE.toast("Bookmarks changed in another tab or on the server. Reload before saving again.", 5e3);
        }, 0);
      }
      throw error;
    }
  }

  // client/src/features/bookmarks/dom.ts
  function required(root, selector) {
    const element = root.querySelector(selector);
    if (!element) throw new Error("Missing bookmark control: " + selector);
    return element;
  }

  // client/src/features/bookmarks/lifetime.ts
  function createLifetime(ctx2, name) {
    const JE = ctx2.core, own = ctx2.own;
    own.bookmarkLifetimes ?? (own.bookmarkLifetimes = {});
    own.bookmarkLifetimes[name]?.dispose();
    const cleanup = /* @__PURE__ */ new Set();
    const dialogs = /* @__PURE__ */ new Set();
    let disposed = false;
    let generation = 0;
    const pending = /* @__PURE__ */ new Set();
    const keep = (value) => {
      if (typeof value === "function") cleanup.add(() => value());
      else if (typeof value === "object" && value !== null && "unsubscribe" in value && typeof value.unsubscribe === "function") {
        const unsubscribe = value.unsubscribe.bind(value);
        cleanup.add(() => unsubscribe());
      }
    };
    const keepTeardown = (value) => {
      if (typeof value === "object" && value !== null && "teardown" in value && typeof value.teardown === "function") {
        const teardown = value.teardown.bind(value);
        cleanup.add(() => teardown());
      } else keep(value);
    };
    const listen = (target, event, callback, capture = false) => {
      target.addEventListener(event, callback, capture);
      cleanup.add(() => target.removeEventListener(event, callback, capture));
    };
    const timeout = (callback, delay) => {
      const current = lease(JE), version = generation;
      const cancel = () => {
        window.clearTimeout(id);
        cleanup.delete(cancel);
        pending.delete(cancel);
      };
      const id = window.setTimeout(() => {
        cleanup.delete(cancel);
        pending.delete(cancel);
        if (!disposed && generation === version && current()) callback();
      }, delay);
      cleanup.add(cancel);
      pending.add(cancel);
      return id;
    };
    const interval = (callback, delay) => {
      const id = window.setInterval(() => {
        if (!disposed) callback();
      }, delay);
      cleanup.add(() => window.clearInterval(id));
      return id;
    };
    const modal = (element) => {
      const previousFocus = document.activeElement;
      element.setAttribute("role", "dialog");
      element.setAttribute("aria-modal", "true");
      element.tabIndex = -1;
      const close = () => {
        element.remove();
        cleanup.delete(close);
        dialogs.delete(close);
        document.removeEventListener("viewshow", close);
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      };
      cleanup.add(close);
      dialogs.add(close);
      document.addEventListener("viewshow", close);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(element.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (!first || !last) {
          event.preventDefault();
          element.focus();
          return;
        }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      timeout(() => {
        if (element.isConnected) (element.querySelector("input") || element.querySelector("button") || element).focus();
      }, 0);
      return close;
    };
    const cancelPending = () => {
      generation++;
      for (const cancel of pending) cancel();
      for (const close of dialogs) close();
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelPending();
      for (const release of cleanup) release();
      cleanup.clear();
    };
    const result = { dispose, cancelPending, keep: keepTeardown, listen, timeout, interval, modal, current: () => {
      const current = lease(JE), version = generation;
      return () => !disposed && generation === version && current();
    } };
    own.bookmarkLifetimes[name] = result;
    keep(JE.session?.onUserChange("bookmarks-" + name, () => {
      for (const close of dialogs) close();
      document.querySelectorAll(".je-bm-player-modal-overlay, .je-bm-library-modal-overlay, .je-bookmark-marker").forEach((el) => el.remove());
      document.querySelectorAll(".sections.bookmarks").forEach((el) => el.replaceChildren());
    }));
    listen(window, "pagehide", dispose);
    return result;
  }

  // client/src/features/bookmarks/domain.ts
  function formatTimestamp(seconds) {
    const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = Math.floor(value % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }

  // client/src/features/bookmarks/state.ts
  function createBookmarkState(JE, getApi2, getCurrentItemData) {
    const logPrefix = "🪼 Jellyfin Enhanced: Bookmarks:";
    function emitBookmarksUpdated(reason = "updated") {
      try {
        document.dispatchEvent(new CustomEvent("je-bookmarks-updated", { detail: { reason } }));
      } catch (e) {
        console.warn(`${logPrefix} Failed to emit update event`, e);
      }
    }
    const mutationQueues = /* @__PURE__ */ new WeakMap();
    function queueBookmarkMutation(owner, mutation) {
      const run = (mutationQueues.get(owner) || Promise.resolve()).then(mutation);
      mutationQueues.set(owner, run.catch(() => {
      }));
      return run;
    }
    let itemDetailsCache = null;
    async function fetchItemDetails(itemId) {
      const owner = JE.userConfig;
      const epoch = JE.session ? JE.session.getEpoch() : 0;
      if (!itemDetailsCache || itemDetailsCache.owner !== owner || itemDetailsCache.epoch !== epoch || itemDetailsCache.itemId !== itemId) {
        itemDetailsCache = { owner, epoch, itemId, data: null, pending: null };
      }
      const cache = itemDetailsCache;
      if (cache.itemId === itemId && cache.data) {
        return cache.data;
      }
      if (cache.pending && cache.itemId === itemId) {
        return cache.pending;
      }
      const fetchPromise = (async () => {
        try {
          const userId = getApi2().getCurrentUserId?.();
          if (!userId) return null;
          const result = readItems(await getApi2().ajax({
            type: "GET",
            url: getApi2().getUrl(`/Users/${userId}/Items`, {
              Ids: itemId,
              Fields: "ProviderIds,Type,Name,SeriesId,ParentIndexNumber,IndexNumber"
            }),
            dataType: "json"
          }));
          if (JE.userConfig !== owner || JE.session && !JE.session.isCurrent(epoch)) return null;
          const item = result[0];
          if (!item) return null;
          let sourceItem = item;
          if ((item.Type === "Season" || item.Type === "Episode") && item.SeriesId) {
            try {
              const seriesResult = readItems(await getApi2().ajax({
                type: "GET",
                url: getApi2().getUrl(`/Users/${userId}/Items`, {
                  Ids: item.SeriesId,
                  Fields: "ProviderIds,Type,Name"
                }),
                dataType: "json"
              }));
              const seriesItem = seriesResult[0];
              if (seriesItem) {
                sourceItem = {
                  ...item,
                  ProviderIds: {
                    ...item.ProviderIds || {},
                    Tmdb: seriesItem.ProviderIds?.Tmdb || item.ProviderIds?.Tmdb,
                    Tvdb: item.ProviderIds?.Tvdb || seriesItem.ProviderIds?.Tvdb
                  }
                };
              }
            } catch (e) {
              console.warn(`${logPrefix} Failed to fetch series info:`, e);
            }
          }
          const tmdbId = sourceItem.ProviderIds?.Tmdb || null;
          const tvdbId = sourceItem.ProviderIds?.Tvdb || null;
          const mediaType = item.Type === "Movie" ? "movie" : item.Type === "Series" || item.Type === "Episode" || item.Type === "Season" ? "tv" : (item.Type || "").toString().toLowerCase();
          const seasonNumber = item.Type === "Episode" ? item.ParentIndexNumber ?? null : null;
          const episodeNumber = item.Type === "Episode" ? item.IndexNumber ?? null : null;
          const details = {
            itemId: item.Id,
            tmdbId,
            tvdbId,
            mediaType,
            name: item.Name || "Unknown",
            type: item.Type,
            seasonNumber,
            episodeNumber
          };
          if (JE.userConfig !== owner || JE.session && !JE.session.isCurrent(epoch)) return null;
          cache.data = details;
          return details;
        } catch (e) {
          console.warn(`${logPrefix} Error fetching item details:`, e);
          return null;
        } finally {
          cache.pending = null;
        }
      })();
      cache.itemId = itemId;
      cache.pending = fetchPromise;
      return fetchPromise;
    }
    function generateBookmarkId() {
      return `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    function findBookmarksForItem(itemId, tmdbId, tvdbId, seasonNumber = null, episodeNumber = null) {
      const allBookmarks = JE.userConfig?.bookmark?.bookmarks || {};
      const exactMatches = [];
      const providerMatches = [];
      const isEpisode = episodeNumber !== null;
      for (const [bookmarkId, bookmark] of Object.entries(allBookmarks)) {
        if (typeof bookmark !== "object" || bookmark === null) continue;
        if (bookmark.itemId === itemId) {
          exactMatches.push({ ...bookmark, id: bookmarkId, exactMatch: true });
          continue;
        }
        if (isEpisode && bookmark.episodeNumber != null) {
          const bookmarkIsSameEpisode = bookmark.episodeNumber === episodeNumber && (bookmark.seasonNumber ?? null) === (seasonNumber ?? null);
          if (!bookmarkIsSameEpisode) continue;
        }
        if (tmdbId && bookmark.tmdbId === tmdbId) {
          providerMatches.push({ ...bookmark, id: bookmarkId, exactMatch: false });
          continue;
        }
        if (tvdbId && bookmark.tvdbId === tvdbId) {
          providerMatches.push({ ...bookmark, id: bookmarkId, exactMatch: false });
        }
      }
      const bookmarks = exactMatches.length > 0 ? exactMatches : providerMatches;
      const hasIdMismatch = exactMatches.length === 0 && providerMatches.length > 0;
      return { bookmarks, hasIdMismatch, exactMatches, providerMatches };
    }
    async function addBookmark(timestamp, label = "") {
      if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error("Invalid bookmark timestamp");
      const owner = JE.userConfig;
      const isCurrentOwner = lease(JE);
      const itemData = getCurrentItemData();
      if (!itemData) {
        JE.toast(JE.t("toast_bookmark_no_item"), 3e3);
        return null;
      }
      const details = await fetchItemDetails(itemData.itemId);
      if (!isCurrentOwner()) return null;
      if (!details) {
        JE.toast(JE.t("toast_bookmark_fetch_failed"), 3e3);
        return null;
      }
      return queueBookmarkMutation(owner, async () => {
        if (!isCurrentOwner()) return null;
        const bookmarkId = generateBookmarkId();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const bookmark = {
          itemId: details.itemId || "",
          tmdbId: details.tmdbId || "",
          tvdbId: details.tvdbId || "",
          mediaType: details.mediaType || "",
          name: details.name || "",
          timestamp,
          label: label || "",
          createdAt: now,
          updatedAt: now,
          syncedFrom: "",
          seasonNumber: details.seasonNumber ?? null,
          episodeNumber: details.episodeNumber ?? null
        };
        if (!owner.bookmark) {
          owner.bookmark = { bookmarks: {} };
        }
        if (!owner.bookmark.bookmarks) {
          owner.bookmark.bookmarks = {};
        }
        const bookmarks = owner.bookmark.bookmarks;
        bookmarks[bookmarkId] = bookmark;
        try {
          await persistBookmarks(JE, getApi2, owner, [bookmarkOperation("create", bookmarkId, bookmark)]);
          console.log(`${logPrefix} Bookmark added:`, bookmarkId, bookmark);
          if (isCurrentOwner()) emitBookmarksUpdated("add");
          return { ...bookmark, id: bookmarkId };
        } catch (e) {
          console.error(`${logPrefix} Failed to save bookmark:`, e);
          delete bookmarks[bookmarkId];
          throw e;
        }
      });
    }
    async function updateBookmark(bookmarkId, updates) {
      if (updates.timestamp !== void 0 && (!Number.isFinite(updates.timestamp) || updates.timestamp < 0)) return false;
      const owner = JE.userConfig;
      const isCurrentOwner = lease(JE);
      if (!JE.userConfig?.bookmark?.bookmarks?.[bookmarkId]) {
        console.warn(`${logPrefix} Bookmark not found:`, bookmarkId);
        return false;
      }
      return queueBookmarkMutation(owner, async () => {
        if (!isCurrentOwner() || !owner.bookmark?.bookmarks?.[bookmarkId]) {
          console.warn(`${logPrefix} Bookmark not found:`, bookmarkId);
          return false;
        }
        const bookmarks = owner.bookmark.bookmarks;
        const original = bookmarks[bookmarkId];
        if (!original) return false;
        const bookmark = { ...original, ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== void 0)), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        bookmarks[bookmarkId] = bookmark;
        try {
          await persistBookmarks(JE, getApi2, owner, [bookmarkOperation("edit", bookmarkId, updates, original.itemId)]);
          console.log(`${logPrefix} Bookmark updated:`, bookmarkId);
          if (isCurrentOwner()) emitBookmarksUpdated("update");
          return true;
        } catch (e) {
          if (bookmarks[bookmarkId] === bookmark) {
            bookmarks[bookmarkId] = original;
          }
          console.error(`${logPrefix} Failed to update bookmark:`, e);
          return false;
        }
      });
    }
    function deleteBookmark(bookmarkId) {
      return deleteCheckedBookmark(bookmarkId);
    }
    async function deleteCheckedBookmark(bookmarkId, expectedItemId) {
      const owner = JE.userConfig;
      const isCurrentOwner = lease(JE);
      if (!JE.userConfig?.bookmark?.bookmarks?.[bookmarkId]) {
        console.warn(`${logPrefix} Bookmark not found:`, bookmarkId);
        return null;
      }
      return queueBookmarkMutation(owner, async () => {
        if (!isCurrentOwner() || !owner.bookmark?.bookmarks?.[bookmarkId]) {
          console.warn(`${logPrefix} Bookmark not found:`, bookmarkId);
          return null;
        }
        const bookmarks = owner.bookmark.bookmarks;
        const original = bookmarks[bookmarkId];
        if (!original) return false;
        if (expectedItemId !== void 0 && original.itemId !== expectedItemId) return null;
        delete bookmarks[bookmarkId];
        try {
          await persistBookmarks(JE, getApi2, owner, [bookmarkOperation("delete", bookmarkId, void 0, original.itemId)]);
          console.log(`${logPrefix} Bookmark deleted:`, bookmarkId);
          if (isCurrentOwner()) emitBookmarksUpdated("delete");
          return true;
        } catch (e) {
          if (!Object.prototype.hasOwnProperty.call(bookmarks, bookmarkId)) {
            bookmarks[bookmarkId] = original;
          }
          console.error(`${logPrefix} Failed to delete bookmark:`, e);
          return false;
        }
      });
    }
    async function deleteAllBookmarks() {
      const owner = JE.userConfig;
      const isCurrentOwner = lease(JE);
      return queueBookmarkMutation(owner, async () => {
        if (!isCurrentOwner()) return false;
        if (!owner.bookmark) owner.bookmark = { bookmarks: {} };
        const previous = owner.bookmark.bookmarks;
        const cleared = {};
        owner.bookmark.bookmarks = cleared;
        try {
          await persistBookmarks(JE, getApi2, owner, [bookmarkOperation("delete-all")]);
          console.log(`${logPrefix} All bookmarks deleted`);
          return true;
        } catch (e) {
          if (owner.bookmark.bookmarks === cleared) owner.bookmark.bookmarks = previous;
          console.error(`${logPrefix} Failed to delete all bookmarks:`, e);
          throw e;
        }
      });
    }
    async function syncBookmarks(oldBookmarks, newItemDetails, timeOffset = 0, { replaceOriginals = false } = {}) {
      const owner = JE.userConfig;
      const isCurrentOwner = lease(JE);
      if (!Number.isFinite(timeOffset)) throw new Error("Invalid bookmark offset");
      const selection = oldBookmarks.map((bookmark) => ({ ...bookmark }));
      return queueBookmarkMutation(owner, async () => {
        if (!isCurrentOwner()) throw new Error("Bookmark owner changed before sync");
        if (!owner.bookmark) owner.bookmark = { bookmarks: {} };
        const bookmarks = owner.bookmark.bookmarks;
        const sources = selection.map((selected) => {
          if (!selected.id) throw new Error("Stored bookmark identity required for copying");
          const current = selected.id ? bookmarks[selected.id] : void 0;
          if (!current || current.itemId !== selected.itemId) throw new Error("Bookmark selection changed before sync");
          return { ...current, id: selected.id, exactMatch: selected.exactMatch };
        });
        if (sources.some((bookmark) => !Number.isFinite(bookmark.timestamp) || !Number.isFinite(bookmark.timestamp + timeOffset))) throw new Error("Invalid bookmark offset");
        const synced = [];
        const removed = [];
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (replaceOriginals) {
          for (const { id } of sources) {
            if (id && Object.prototype.hasOwnProperty.call(bookmarks, id)) {
              const original = bookmarks[id];
              if (original) removed.push([id, original]);
              delete bookmarks[id];
            }
          }
        }
        for (const oldBookmark of sources) {
          const newBookmarkId = generateBookmarkId();
          const newTimestamp = Math.max(0, oldBookmark.timestamp + timeOffset);
          const { id: _oldId, exactMatch: _match, ...preserved } = oldBookmark;
          const newBookmark = {
            ...preserved,
            itemId: newItemDetails.itemId,
            tmdbId: newItemDetails.tmdbId ?? null,
            tvdbId: newItemDetails.tvdbId ?? null,
            mediaType: newItemDetails.mediaType ?? "",
            name: newItemDetails.name ?? "",
            timestamp: newTimestamp,
            label: oldBookmark.label || "",
            createdAt: oldBookmark.createdAt || now,
            updatedAt: now,
            syncedFrom: oldBookmark.itemId,
            // Track where it came from
            seasonNumber: newItemDetails.seasonNumber ?? null,
            episodeNumber: newItemDetails.episodeNumber ?? null
          };
          bookmarks[newBookmarkId] = newBookmark;
          synced.push({ ...newBookmark, id: newBookmarkId });
        }
        try {
          await persistBookmarks(JE, getApi2, owner, synced.map((copy, index) => {
            const source = sources[index];
            if (!source?.id) throw new Error("Stored bookmark identity required for copying");
            return { ...bookmarkOperation(replaceOriginals ? "replace" : "copy", copy.id, {
              itemId: copy.itemId,
              tmdbId: copy.tmdbId,
              tvdbId: copy.tvdbId,
              mediaType: copy.mediaType,
              name: copy.name,
              seasonNumber: copy.seasonNumber,
              episodeNumber: copy.episodeNumber
            }, source.itemId), SourceId: source.id, Offset: timeOffset };
          }));
          console.log(`${logPrefix} Synced ${synced.length} bookmarks to new item ID`);
          if (isCurrentOwner()) emitBookmarksUpdated("sync");
          return synced;
        } catch (e) {
          console.error(`${logPrefix} Failed to sync bookmarks:`, e);
          synced.forEach((bm) => delete bookmarks[bm.id]);
          removed.forEach(([id, original]) => {
            bookmarks[id] = original;
          });
          throw e;
        }
      });
    }
    async function adjustOffsets(selected, offset) {
      if (!Number.isFinite(offset)) throw new Error("Invalid offset");
      const owner = JE.userConfig, current = lease(JE);
      return queueBookmarkMutation(owner, async () => {
        if (!current()) throw new Error("Bookmark owner changed before offset adjustment");
        const records = owner.bookmark?.bookmarks;
        if (!records) return 0;
        if (selected.some((bookmark) => {
          const original = records[bookmark.id];
          return original && Number.isFinite(original.timestamp) && !Number.isFinite(original.timestamp + offset);
        })) throw new Error("Invalid bookmark offset");
        const changes = [];
        for (const selectedBookmark of selected) {
          const original = records[selectedBookmark.id];
          if (!original || original.itemId !== selectedBookmark.itemId || !Number.isFinite(original.timestamp)) continue;
          const changed = { ...original, timestamp: Math.max(0, original.timestamp + offset), syncedFrom: "", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          records[selectedBookmark.id] = changed;
          changes.push([selectedBookmark.id, original, changed]);
        }
        if (!changes.length) return 0;
        try {
          await persistBookmarks(JE, getApi2, owner, changes.map(([id, original]) => ({ ...bookmarkOperation("offset", id, void 0, original.itemId), Offset: offset })));
          if (current()) emitBookmarksUpdated("offset");
          return changes.length;
        } catch (error) {
          for (const [id, original, changed] of changes) if (records[id] === changed) records[id] = original;
          throw error;
        }
      });
    }
    async function backfillEpisodeMetadata() {
      const owner = JE.userConfig;
      const isCurrentOwner = lease(JE);
      const allBookmarks = owner?.bookmark?.bookmarks || {};
      const candidates = Object.entries(allBookmarks).filter(
        ([, bm]) => bm?.mediaType === "tv" && bm.itemId && bm.episodeNumber == null
      );
      if (candidates.length === 0) return;
      const found = [];
      for (const [id, bm] of candidates) {
        if (!isCurrentOwner()) return;
        try {
          const details = await fetchItemDetails(bm.itemId);
          if (!isCurrentOwner()) return;
          if (details?.episodeNumber != null) found.push([id, bm.itemId, details]);
        } catch (e) {
        }
      }
      if (found.length === 0) return;
      await queueBookmarkMutation(owner, async () => {
        if (!isCurrentOwner()) return;
        const bookmarks = owner.bookmark?.bookmarks;
        if (!bookmarks) return;
        const applied = [];
        for (const [id, itemId, details] of found) {
          const original = bookmarks[id];
          if (!original || original.itemId !== itemId || original.episodeNumber != null) continue;
          const filled = {
            ...original,
            seasonNumber: details.seasonNumber,
            episodeNumber: details.episodeNumber,
            ...details.tvdbId ? { tvdbId: details.tvdbId } : {}
          };
          bookmarks[id] = filled;
          applied.push([id, original, filled]);
        }
        if (applied.length === 0) return;
        try {
          await persistBookmarks(JE, getApi2, owner, applied.map(([id, original, filled]) => bookmarkOperation("backfill", id, {
            seasonNumber: filled.seasonNumber,
            episodeNumber: filled.episodeNumber,
            ...filled.tvdbId ? { tvdbId: filled.tvdbId } : {}
          }, original.itemId)));
          console.log(`${logPrefix} Backfilled episode metadata for ${applied.length} bookmark(s)`);
        } catch (e) {
          applied.forEach(([id, original, filled]) => {
            if (bookmarks[id] === filled) bookmarks[id] = original;
          });
          console.warn(`${logPrefix} Failed to save backfilled episode metadata:`, e);
        }
      });
    }
    async function cleanupOrphanedBookmarks() {
      const isCurrentOwner = lease(JE);
      const allBookmarks = JE.userConfig?.bookmark?.bookmarks || {};
      const itemIds = /* @__PURE__ */ new Set();
      const toDelete = [];
      for (const bookmark of Object.values(allBookmarks)) {
        if (bookmark?.itemId) itemIds.add(bookmark.itemId);
      }
      const userId = getApi2().getCurrentUserId?.();
      if (!userId) return { cleaned: 0, errors: 0 };
      let cleaned = 0;
      let errors = 0;
      for (const itemId of itemIds) {
        try {
          await (JE.helpers?.getItemCached ? JE.helpers.getItemCached(itemId, { userId }) : getApi2().getItem(userId, itemId));
          if (!isCurrentOwner()) return { cleaned: 0, errors: 0 };
        } catch (e) {
          if (!isCurrentOwner()) return { cleaned: 0, errors: 0 };
          if (!isMissingItem(e)) {
            errors++;
            continue;
          }
          for (const [bookmarkId, bookmark] of Object.entries(allBookmarks)) {
            if (bookmark?.itemId === itemId) {
              toDelete.push({ bookmarkId, itemId });
            }
          }
        }
      }
      for (const { bookmarkId, itemId } of toDelete) {
        if (!isCurrentOwner()) return { cleaned, errors };
        try {
          const deleted = await deleteCheckedBookmark(bookmarkId, itemId);
          if (deleted) cleaned++;
          else if (deleted === false) errors++;
        } catch (e) {
          errors++;
        }
      }
      console.log(`${logPrefix} Cleanup: ${cleaned} orphaned bookmarks removed, ${errors} errors`);
      return { cleaned, errors };
    }
    return { addBookmark, updateBookmark, deleteBookmark, deleteAllBookmarks, syncBookmarks, backfillEpisodeMetadata, cleanupOrphanedBookmarks, findBookmarksForItem, fetchItemDetails, formatTimestamp, adjustOffsets };
  }

  // client/src/features/bookmarks/bookmarks.ts
  var { ctx, host, getApi } = bookmarksHost();
  function install(JE) {
    const lifetime = createLifetime(ctx, "bookmarks");
    const setTimeout = lifetime.timeout;
    if (!JE.pluginConfig?.BookmarksEnabled) {
      console.log("🪼 Jellyfin Enhanced: Bookmarks feature is disabled");
      return;
    }
    const logPrefix = "🪼 Jellyfin Enhanced: Bookmarks:";
    function getCurrentItemData() {
      try {
        const btnUserRating = document.querySelector(".videoOsdBottom .btnUserRating[data-id]");
        const itemId = btnUserRating?.dataset?.id || null;
        if (!itemId) {
          console.debug(`${logPrefix} No item ID found`);
          return null;
        }
        return { itemId };
      } catch (e) {
        console.warn(`${logPrefix} Error getting item data:`, e);
        return null;
      }
    }
    const escapeHtml = JE.escapeHtml;
    const { addBookmark, updateBookmark, deleteBookmark, deleteAllBookmarks, syncBookmarks, backfillEpisodeMetadata, cleanupOrphanedBookmarks, findBookmarksForItem, fetchItemDetails, formatTimestamp: formatTimestamp2, adjustOffsets } = createBookmarkState(JE, getApi, getCurrentItemData);
    function createBookmarkMarkers(video, bookmarksList) {
      const isCurrent = lifetime.current();
      console.log(`${logPrefix} createBookmarkMarkers called - video:`, !!video, "bookmarks:", bookmarksList.length);
      if (!video) {
        console.log(`${logPrefix} Early return - no video or no bookmarks`);
        return;
      }
      const osdBottom = document.querySelector(".videoOsdBottom");
      if (!osdBottom) {
        console.log(`${logPrefix} No .videoOsdBottom found`);
        return;
      }
      const positionSlider = osdBottom.querySelector('.osdPositionSlider, .sliderBubble, .mdl-slider, input[type="range"]');
      if (!positionSlider) {
        console.log(`${logPrefix} No position slider found`);
        return;
      }
      const sliderContainer = positionSlider.closest(".osdPositionSliderContainer, .sliderContainer") || positionSlider.parentElement;
      if (!sliderContainer) {
        console.log(`${logPrefix} No slider container found`);
        return;
      }
      const sliderPos = window.getComputedStyle(sliderContainer).position;
      if (sliderPos === "static") {
        sliderContainer.style.position = "relative";
      }
      const existingMarkers = sliderContainer.querySelectorAll(".je-bookmark-marker");
      console.log(`${logPrefix} Removing ${existingMarkers.length} existing markers`);
      existingMarkers.forEach((el) => el.remove());
      const duration = video.duration;
      if (!duration || !isFinite(duration)) {
        console.log(`${logPrefix} Invalid duration:`, duration);
        return;
      }
      bookmarksList.forEach((bookmark) => {
        if (!Number.isFinite(bookmark.timestamp) || bookmark.timestamp < 0) return;
        const percent = bookmark.timestamp / duration * 100;
        const markerColor = bookmark.exactMatch ? "#00d4ff" : "#ffa500";
        const marker = document.createElement("div");
        marker.className = "je-bookmark-marker";
        marker.style.cssText = `
        position: absolute;
        left: ${percent}%;
        bottom: 0%;
        transform: translate(-50%, -50%);
        z-index: 1000;
        pointer-events: all;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
        const icon = document.createElement("span");
        icon.className = "material-icons";
        icon.textContent = "location_pin";
        icon.style.cssText = `
        font-size: 24px;
        color: ${markerColor};
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
        pointer-events: none;
      `;
        marker.appendChild(icon);
        const labelText = bookmark.label || JE.t("bookmark_no_label");
        const versionNote = !bookmark.exactMatch ? ` ${JE.t("bookmark_file_changed")}` : "";
        marker.title = `${labelText} - ${formatTimestamp2(bookmark.timestamp)}${versionNote}`;
        marker.addEventListener("click", (e) => {
          if (!isCurrent() || !video.isConnected) return;
          e.stopPropagation();
          video.currentTime = bookmark.timestamp;
          JE.toast(`${JE.t("toast_jumped_to_bookmark")}: ${formatTimestamp2(bookmark.timestamp)}`, 2e3);
        });
        sliderContainer.appendChild(marker);
      });
      console.log(`${logPrefix} ✓ Created ${bookmarksList.length} bookmark markers`);
    }
    async function updateBookmarkMarkersForCurrentVideo() {
      const isCurrent = lifetime.current();
      console.log(`${logPrefix} updateBookmarkMarkersForCurrentVideo called`);
      const video = document.querySelector(".videoPlayerContainer video");
      if (!video) {
        console.log(`${logPrefix} No video element found`);
        return;
      }
      const itemData = getCurrentItemData();
      if (!itemData) {
        console.log(`${logPrefix} No item data (no btnUserRating?)`);
        return;
      }
      console.log(`${logPrefix} Fetching details for item:`, itemData.itemId);
      const details = await fetchItemDetails(itemData.itemId);
      if (!isCurrent() || getCurrentItemData()?.itemId !== itemData.itemId) return;
      if (!details) {
        console.log(`${logPrefix} Failed to fetch item details`);
        return;
      }
      console.log(`${logPrefix} Item details:`, details);
      const { bookmarks: bookmarksList } = findBookmarksForItem(
        details.itemId,
        details.tmdbId,
        details.tvdbId,
        details.seasonNumber,
        details.episodeNumber
      );
      console.log(`${logPrefix} Found ${bookmarksList.length} bookmarks for this item`);
      if (document.querySelector(".videoPlayerContainer video") !== video) return;
      createBookmarkMarkers(video, bookmarksList);
    }
    async function showBookmarkModal(mode = "add", existingBookmark = null) {
      const isCurrent = lifetime.current();
      const video = document.querySelector(".videoPlayerContainer video");
      const currentTime = video?.currentTime || 0;
      const itemData = getCurrentItemData();
      if (!itemData) {
        if (isCurrent()) JE.toast(JE.t("toast_bookmark_no_item"), 3e3);
        return;
      }
      const details = await fetchItemDetails(itemData.itemId);
      if (!isCurrent() || getCurrentItemData()?.itemId !== itemData.itemId) return;
      if (!details) {
        if (isCurrent()) JE.toast(JE.t("toast_bookmark_fetch_failed"), 3e3);
        return;
      }
      const { bookmarks: existingBookmarks } = findBookmarksForItem(
        details.itemId,
        details.tmdbId,
        details.tvdbId,
        details.seasonNumber,
        details.episodeNumber
      );
      const isEdit = mode === "edit" && existingBookmark;
      const title = isEdit ? JE.t("bookmark_edit_title") : mode === "view" ? "Your Bookmarks" : JE.t("bookmark_add_title");
      const timestamp = isEdit ? existingBookmark.timestamp : currentTime;
      const label = isEdit ? existingBookmark.label : "";
      const formHtml = `
      <style>
        .je-bm-player-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.85);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .je-bm-player-modal-container {
          background: #181818;
          border-radius: 12px;
          max-width: 700px;
          width: 90%;
          max-height: 85vh;
          padding: 24px;
          position: relative;
          box-shadow: 0 8px 32px rgba(0,0,0,0.8);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        @media (max-width: 600px) {
          .je-bm-player-modal-container {
            padding: 16px;
            max-height: 90vh;
            width: 95%;
          }
        }
        .je-bookmark-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: transparent;
          border: none;
          color: #fff;
          font-size: 32px;
          cursor: pointer;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background 0.2s;
        }
        .je-bookmark-modal-close:hover {
          background: rgba(255,255,255,0.1);
        }
        .je-bookmark-modal-actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
          justify-content: flex-end;
          flex-shrink: 0;
        }
        .je-bookmark-btn-submit,
        .je-bookmark-btn-cancel {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .je-bookmark-btn-submit {
          background: #00a86b;
          color: #fff;
        }
        .je-bookmark-btn-submit:hover {
          background: #00c47a;
        }
        .je-bookmark-btn-cancel {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        .je-bookmark-btn-cancel:hover {
          background: rgba(255,255,255,0.15);
        }
        .je-bookmark-modal {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        .je-bookmark-hero { padding: 0 0 20px 0; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; }
        .je-bookmark-hero-title { font-size: 20px; font-weight: 600; color: #fff; margin: 0 0 6px 0; }
        .je-bookmark-hero-icon { display: none; }
        .je-bookmark-hero-subtitle { font-size: 14px; color: #888; margin: 0; }

        .je-bookmark-form-grid { display: grid; gap: 20px; }
        .je-bookmark-input-group { position: relative; }
        .je-bookmark-input-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #e0e0e0;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .je-bookmark-input, .je-bookmark-textarea {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          color: #fff;
          font-family: inherit;
          font-size: 15px;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .je-bookmark-input:focus, .je-bookmark-textarea:focus {
          outline: none;
          border-color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.08);
        }
        .je-bookmark-input[readonly] {
          background: rgba(0,0,0,0.2);
          cursor: not-allowed;
          border-color: rgba(255,255,255,0.1);
        }
        .je-bookmark-textarea {
          resize: vertical;
          min-height: 80px;
          font-family: inherit;
        }

        .je-bookmark-list {
          margin-top: 28px;
          max-height: 300px;
          overflow-y: auto;
          padding-right: 8px;
        }
        @media (max-width: 600px) {
          .je-bookmark-list {
            max-height: 150px;
            margin-top: 16px;
          }
        }
        .je-bookmark-list::-webkit-scrollbar {
          width: 8px;
        }
        .je-bookmark-list::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
        }
        .je-bookmark-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 4px;
        }
        .je-bookmark-list::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }
        .je-bookmark-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .je-bookmark-list-title {
          font-size: 13px;
          font-weight: 600;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .je-bookmark-list-count {
          background: rgba(255,255,255,0.1);
          color: #fff;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .je-bookmark-item {
            display: flex;
            gap: 12px;
            padding: 14px 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            margin-bottom: 10px;
            transition: all 0.2s;
            flex-wrap: wrap;
            flex-direction: row;
            align-items: center;
        }

        .je-bookmark-item:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.2);
        }
        .je-bookmark-item-marker {
          width: 3px;
          background: rgba(255,255,255,0.3);
          border-radius: 2px;
          flex-shrink: 0;
        }
        .je-bookmark-item-content { flex: 1; min-width: 0; }
        .je-bookmark-item-time {
          font-weight: 600;
          color: #fff;
          font-size: 15px;
          margin-bottom: 4px;
        }
        .je-bookmark-item-label {
          font-size: 14px;
          color: #ccc;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .je-bookmark-item-warning {
          color: #ffa500;
          font-size: 12px;
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .je-bookmark-item-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }
        .je-bookmark-btn {
          padding: 8px;
          font-size: 20px;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
        }
        .je-bookmark-btn:hover {
          opacity: 0.9;
          color: #fff;
        }
        .je-bookmark-btn-jump:hover {
          background: #00a86b;
        }
        .je-bookmark-btn-delete:hover {
          background: #b60505;
        }

        .je-bookmark-empty {
          text-align: center;
          padding: 40px 20px;
          color: #888;
          font-size: 14px;
        }
        .je-bookmark-empty-icon {
          font-size: 48px;
          margin-bottom: 12px;
          opacity: 0.5;
        }
      </style>
      <div class="je-bookmark-modal">
        <div class="je-bookmark-hero">
          <div class="je-bookmark-hero-title">
            <span>${title}</span>
          </div>
          <div class="je-bookmark-hero-subtitle">${escapeHtml(details.name)}</div>
        </div>
        <div class="je-bookmark-form-grid">
          <div class="je-bookmark-input-group">
            <label for="bookmark-time">${JE.t("bookmark_time_label")}</label>
            <input
              type="text"
              id="bookmark-time"
              class="je-bookmark-input"
              value="${formatTimestamp2(timestamp)}"
              readonly>
          </div>
          <div class="je-bookmark-input-group">
            <label for="bookmark-label">${JE.t("bookmark_label_label")}</label>
            <input
              type="text"
              id="bookmark-label"
              class="je-bookmark-input"
              placeholder="${JE.t("bookmark_label_placeholder")}"
              value="${escapeHtml(label)}"
              maxlength="100">
          </div>
        </div>
        ${existingBookmarks.length > 0 ? `
          <div class="je-bookmark-list">
            <div class="je-bookmark-list-header">
              <div class="je-bookmark-list-title">${JE.t("bookmark_existing_title")}</div>
              <div class="je-bookmark-list-count">${existingBookmarks.length}</div>
            </div>
            ${existingBookmarks.map((bm) => `
              <div class="je-bookmark-item">
                <div class="je-bookmark-item-marker"></div>
                <div class="je-bookmark-item-content">
                  <div class="je-bookmark-item-time">${formatTimestamp2(bm.timestamp)}</div>
                  ${bm.label ? `<div class="je-bookmark-item-label">${escapeHtml(bm.label)}</div>` : ""}
                  ${!bm.exactMatch ? `<div class="je-bookmark-item-warning">${JE.t("bookmark_file_changed")}</div>` : ""}
                </div>
                <div class="je-bookmark-item-actions">
                  <button class="je-bookmark-btn je-bookmark-btn-jump" data-bookmark-id="${escapeHtml(bm.id)}" title="${JE.t("bookmark_jump")}">
                    <span class="material-icons">forward</span>
                  </button>
                  <button class="je-bookmark-btn je-bookmark-btn-delete" data-bookmark-id="${escapeHtml(bm.id)}" title="${JE.t("bookmark_delete_confirm")}">
                    <span class="material-icons">delete</span>
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="je-bookmark-empty">
            <div>${JE.t("bookmark_none")}</div>
          </div>
        `}
      </div>
    `;
      const modal = document.createElement("div");
      modal.className = "je-bm-player-modal-overlay";
      modal.innerHTML = `
      <div class="je-bm-player-modal-container">
        <button class="je-bookmark-modal-close">×</button>
        ${formHtml}
        <div class="je-bookmark-modal-actions">
          <button class="je-bookmark-btn-submit">${isEdit ? JE.t("bookmark_save") : JE.t("bookmark_add")}</button>
          <button class="je-bookmark-btn-cancel">
            <span class="material-icons" aria-hidden="true" style="font-size: 18px;">close</span>
            <span>Cancel</span>
          </button>
        </div>
      </div>
    `;
      document.body.appendChild(modal);
      modal.addEventListener("keydown", (e) => e.stopPropagation());
      modal.addEventListener("keyup", (e) => e.stopPropagation());
      modal.addEventListener("keypress", (e) => e.stopPropagation());
      modal.addEventListener("wheel", (e) => e.stopPropagation());
      const closeDialog = lifetime.modal(modal);
      required(modal, ".je-bookmark-modal-close").addEventListener("click", closeDialog);
      required(modal, ".je-bookmark-btn-cancel").addEventListener("click", closeDialog);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeDialog();
      });
      setTimeout(() => {
        const labelInput = modal.querySelector("#bookmark-label");
        if (labelInput) labelInput.focus();
        modal.style.opacity = "1";
      }, 10);
      required(modal, ".je-bookmark-btn-submit").addEventListener("click", async () => {
        if (!isCurrent()) return;
        const labelInput = required(modal, "#bookmark-label").value.trim();
        try {
          if (isEdit && existingBookmark) {
            if (!await updateBookmark(existingBookmark.id, { label: labelInput })) {
              if (isCurrent()) JE.toast(JE.t("toast_bookmark_save_failed"), 3e3);
              return;
            }
            if (isCurrent()) JE.toast(JE.t("toast_bookmark_updated"), 2e3);
          } else {
            if (!await addBookmark(timestamp, labelInput)) return;
            if (isCurrent()) JE.toast(JE.t("toast_bookmark_updated"), 2e3);
          }
          if (!isCurrent()) return;
          updateBookmarkMarkersForCurrentVideo();
          closeDialog();
        } catch (e) {
          if (isCurrent()) JE.toast(JE.t("toast_bookmark_save_failed"), 3e3);
        }
      });
      modal.querySelectorAll(".je-bookmark-btn-jump").forEach((btn) => {
        btn.addEventListener("click", () => {
          const bookmarkId = btn.dataset.bookmarkId;
          if (!bookmarkId) return;
          const bookmark = existingBookmarks.find((bm) => bm.id === bookmarkId);
          if (bookmark && video) {
            video.currentTime = bookmark.timestamp;
            if (isCurrent()) JE.toast(`${JE.t("toast_jumped_to_bookmark")}: ${formatTimestamp2(bookmark.timestamp)}`, 2e3);
            closeDialog();
          }
        });
      });
      modal.querySelectorAll(".je-bookmark-btn-delete").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!isCurrent()) return;
          const bookmarkId = btn.dataset.bookmarkId;
          if (!bookmarkId) return;
          btn.disabled = true;
          let deleted;
          try {
            deleted = await deleteBookmark(bookmarkId);
          } finally {
            btn.disabled = false;
          }
          if (!isCurrent() || deleted === null) return;
          if (!deleted) {
            if (isCurrent()) JE.toast(JE.t("toast_bookmark_delete_failed"), 3e3);
            return;
          }
          if (isCurrent()) JE.toast(JE.t("toast_bookmark_deleted"), 2e3);
          updateBookmarkMarkersForCurrentVideo();
          closeDialog();
          setTimeout(() => showBookmarkModal(mode, existingBookmark), 300);
        });
      });
    }
    ctx.own.bookmarks = {
      add: addBookmark,
      update: updateBookmark,
      delete: deleteBookmark,
      deleteAll: deleteAllBookmarks,
      findForItem: findBookmarksForItem,
      showModal: showBookmarkModal,
      updateMarkers: updateBookmarkMarkersForCurrentVideo,
      formatTimestamp: formatTimestamp2,
      syncBookmarks,
      cleanupOrphaned: cleanupOrphanedBookmarks,
      backfillEpisodeMetadata,
      adjustOffsets
    };
    function addOsdBookmarkButton() {
      if (document.getElementById("jeBookmarkBtn")) return;
      const controlsContainer = document.querySelector(".videoOsdBottom .buttons.focuscontainer-x");
      if (!controlsContainer) return;
      const nativeSettingsButton = controlsContainer.querySelector(".btnVideoOsdSettings");
      if (!nativeSettingsButton) return;
      const bookmarkBtn = document.createElement("button");
      bookmarkBtn.id = "jeBookmarkBtn";
      bookmarkBtn.setAttribute("is", "paper-icon-button-light");
      bookmarkBtn.className = "autoSize paper-icon-button-light";
      bookmarkBtn.title = JE.t("shortcut_BookmarkCurrentTime");
      bookmarkBtn.innerHTML = '<span class="largePaperIconButton material-icons" aria-hidden="true">bookmark_add</span>';
      bookmarkBtn.onclick = (e) => {
        e.stopPropagation();
        showBookmarkModal("add");
      };
      nativeSettingsButton.parentElement?.insertBefore(bookmarkBtn, nativeSettingsButton);
      console.log(`${logPrefix} ✓ Added OSD bookmark button`);
    }
    ctx.own.initializeBookmarks = /* @__PURE__ */ (function() {
      let initialized = false;
      let cleanupFunctions = [];
      return function() {
        if (initialized) {
          console.log(`${logPrefix} Already initialized, skipping...`);
          return;
        }
        initialized = true;
        console.log(`${logPrefix} Initializing enhanced bookmarks...`);
        backfillEpisodeMetadata().catch((e) => console.warn(`${logPrefix} Backfill failed:`, e));
        let lastInjectedOsdKey = null;
        const osdObserverId = "je-bookmarks-osd";
        const videoObserverId = "je-bookmarks-video-changes";
        function getOsdKey() {
          const video = document.querySelector(".videoPlayerContainer video");
          return video?.currentSrc || video?.src || window.location.href;
        }
        function debounce(callback, delay) {
          let timer;
          const cancel = () => {
            if (timer !== void 0) window.clearTimeout(timer);
            timer = void 0;
          };
          cleanupFunctions.push(cancel);
          return (...args) => {
            cancel();
            const current = lifetime.current();
            timer = window.setTimeout(() => {
              timer = void 0;
              if (initialized && current()) callback(...args);
            }, delay);
          };
        }
        const debouncedOsdInjection = debounce(() => {
          if (!JE.isVideoPage()) return;
          const osdBottom = document.querySelector(".videoOsdBottom");
          const video = document.querySelector(".videoPlayerContainer video");
          const currentOsdKey = getOsdKey();
          if (osdBottom && video && currentOsdKey !== lastInjectedOsdKey) {
            updateBookmarkMarkersForCurrentVideo();
            addOsdBookmarkButton();
            lastInjectedOsdKey = currentOsdKey;
            console.log(`${logPrefix} Injected markers/button for ${currentOsdKey}`);
          }
        }, 200);
        function ensureOsdObserver() {
          if (!JE.isVideoPage()) {
            JE.helpers.disconnectObserver(osdObserverId);
            return;
          }
          JE.helpers.createObserver(
            osdObserverId,
            debouncedOsdInjection,
            document.body,
            { childList: true, subtree: true }
          );
        }
        const handlePlayingEvent = debounce((e) => {
          if (e.target instanceof HTMLVideoElement && JE.isVideoPage()) {
            debouncedOsdInjection();
          }
        }, 300);
        const handleMetadataEvent = debounce((e) => {
          if (e.target instanceof HTMLVideoElement && JE.isVideoPage()) {
            debouncedOsdInjection();
          }
        }, 300);
        const handleViewShow = () => {
          if (JE.isVideoPage()) {
            lastInjectedOsdKey = null;
            ensureOsdObserver();
            debouncedOsdInjection();
          } else {
            lastInjectedOsdKey = null;
            JE.helpers.disconnectObserver(osdObserverId);
            JE.helpers.disconnectObserver(videoObserverId);
          }
        };
        document.addEventListener("playing", handlePlayingEvent, true);
        cleanupFunctions.push(() => document.removeEventListener("playing", handlePlayingEvent, true));
        document.addEventListener("loadedmetadata", handleMetadataEvent, true);
        cleanupFunctions.push(() => document.removeEventListener("loadedmetadata", handleMetadataEvent, true));
        document.addEventListener("viewshow", handleViewShow);
        cleanupFunctions.push(() => document.removeEventListener("viewshow", handleViewShow));
        if (JE.isVideoPage()) {
          ensureOsdObserver();
          debouncedOsdInjection();
        }
        ctx.own.cleanupBookmarks = function() {
          lifetime.cancelPending();
          cleanupFunctions.forEach((fn) => fn());
          document.querySelectorAll(".je-bookmark-marker, #jeBookmarkBtn, .je-bm-player-modal-overlay").forEach((el) => el.remove());
          cleanupFunctions = [];
          JE.helpers.disconnectObserver(osdObserverId);
          JE.helpers.disconnectObserver(videoObserverId);
          initialized = false;
          console.log(`${logPrefix} Cleaned up`);
        };
        lifetime.keep(ctx.own.cleanupBookmarks);
        console.log(`${logPrefix} ✓ Initialized`);
      };
    })();
  }
  install(ctx.core);
})();
})();
//# sourceMappingURL=bookmarks.js.map
