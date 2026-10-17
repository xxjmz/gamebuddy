using System.Text.Json;
using GameBuddyBridge.Scripts;

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static Dictionary<string, object?> Archetype(string id, object delta, int? beforeScore = null)
{
    var archetype = new Dictionary<string, object?>
    {
        ["id"] = id,
        ["deltaPoints"] = delta,
        ["reason"] = $"{id}-reason"
    };
    if (beforeScore is int score) archetype["beforeScore"] = score;
    return archetype;
}

static Dictionary<string, object?> Card(
    string cardId,
    object legacyDelta,
    IEnumerable<Dictionary<string, object?>> archetypes) => new()
{
    ["cardId"] = cardId,
    ["deltaPoints"] = legacyDelta,
    ["reason"] = "legacy-reason",
    ["archetypes"] = archetypes
};

static string Message(params Dictionary<string, object?>[] cards) => JsonSerializer.Serialize(new
{
    type = "draft_impact",
    signature = "ANGER:False|POMMEL_STRIKE:False|BASH:True",
    impacts = cards
});

static Dictionary<string, object?>[] ValidArchetypes(int autoStrike = 1) =>
[
    Archetype("auto_strike", autoStrike),
    Archetype("exhaust", -2),
    Archetype("strength", 0),
    Archetype("block", 3)
];

var validJson = Message(
    Card("ANGER", 1, ValidArchetypes()),
    Card("POMMEL_STRIKE", -100, ValidArchetypes(-100)),
    Card("BASH", 100, ValidArchetypes(100)));
Assert(GameBuddyRewardImpactCodec.TryParse(validJson, out var parsed), "Valid three-card message was rejected.");
Assert(parsed!.Impacts.Count == 3, "All three candidate impacts must be retained.");
Assert(parsed.Impacts["ANGER"].Archetypes.Select(item => item.Id)
    .SequenceEqual(GameBuddyRewardImpactCodec.ArchetypeIds), "Archetypes were not normalized to fixed order.");

var reversed = ValidArchetypes().Reverse();
Assert(GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, reversed)), out var reordered)
    && reordered!.Impacts["ANGER"].Archetypes[0].Id == "auto_strike",
    "Unique required IDs should parse and normalize regardless of input order.");

var missing = ValidArchetypes()[..3];
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, missing)), out _),
    "Missing archetype was accepted.");

var duplicate = ValidArchetypes();
duplicate[3] = Archetype("auto_strike", 3);
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, duplicate)), out _),
    "Duplicate archetype ID was accepted.");

var outOfRange = ValidArchetypes();
outOfRange[2] = Archetype("strength", 101);
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, outOfRange)), out _),
    "Out-of-range archetype delta was accepted.");

var fractional = ValidArchetypes();
fractional[1] = Archetype("exhaust", 0.5);
Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 1, fractional)), out _),
    "Fractional archetype delta was accepted.");

Assert(!GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 2, ValidArchetypes())), out _),
    "Legacy auto-strike mismatch was accepted.");
Assert(!GameBuddyRewardImpactCodec.TryParse(
    """{"type":"draft_impact","signature":"old","impacts":[{"cardId":"ANGER","deltaPoints":1}]}""", out _),
    "Legacy one-line message was accepted.");

Assert(GameBuddyRewardImpactCodec.FormatLine(new("auto_strike", 4, null), true) == "自动打击 +4%",
    "Chinese positive formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("exhaust", -2, null), false) == "Exhaust -2%",
    "English negative formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("block", 0, null), true) == "格挡壁垒 0%",
    "Zero formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("auto_strike", 8, null, 9), true) == "自动打击 9% +8",
    "Current percentage formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("strength", -2, null, 18), true) == "力量叠加 18% -2",
    "Negative current percentage formatting is incorrect.");
var withScore = ValidArchetypes();
withScore[0] = Archetype("auto_strike", 8, 9);
Assert(GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 8, withScore)), out var scored)
    && scored!.Impacts["ANGER"].Archetypes[0].BeforeScore == 9,
    "beforeScore was not retained.");

Console.WriteLine("GameBuddy reward impact codec tests passed.");
