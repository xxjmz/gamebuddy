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
        ["reason"] = $"{id}-reason",
        ["beforeScore"] = beforeScore ?? 10,
        ["afterScore"] = Math.Clamp((beforeScore ?? 10) + (delta is int value ? value : 0), 0, 100),
        ["beforeStage"] = "unformed",
        ["afterStage"] = "unformed",
        ["completedAxes"] = Array.Empty<string>()
    };
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

Assert(GameBuddyRewardImpactCodec.FormatLine(new("auto_strike", 4, null), true) == "自动打击 +4",
    "Chinese positive formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("exhaust", -2, null), false) == "Exhaust -2",
    "English negative formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(new("block", 0, null), true) == "格挡壁垒 0",
    "Zero formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(
    new("auto_strike", 14, null, 42, false, 56, "unformed", "started", ["auto_gate"]), true)
    == "自动打击 42 → 56 (+14) · 启动", "Started transition formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatLine(
    new("strength", -2, null, 18, true, 16, "started", "started", []), true)
    == "力量叠加 18 → 16 (-2)", "Negative current score formatting is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatProgress(42, 0) == "42", "Zero delta should keep the current score only.");
Assert(GameBuddyRewardImpactCodec.FormatSignedDelta(14) == "+14", "Positive delta sign is incorrect.");
Assert(GameBuddyRewardImpactCodec.FormatSignedDelta(-2) == "-2", "Negative delta sign is incorrect.");
var withScore = ValidArchetypes();
withScore[0] = Archetype("auto_strike", 8, 9);
Assert(GameBuddyRewardImpactCodec.TryParse(Message(Card("ANGER", 8, withScore)), out var scored)
    && scored!.Impacts["ANGER"].Archetypes[0].BeforeScore == 9
    && scored.Impacts["ANGER"].Archetypes[0].AfterScore == 17,
    "before/after score was not retained.");

static RewardSelectionCard RewardCard(string id, bool upgraded = false) => new(id, upgraded);

var selection = new GameBuddyRewardSelectionTracker();
var baseline = new[] { RewardCard("STRIKE"), RewardCard("STRIKE"), RewardCard("BASH", true) };
var candidates = new[] { RewardCard("ANGER"), RewardCard("POMMEL_STRIKE"), RewardCard("BASH", true) };
selection.Begin("reward-1", baseline, candidates);
selection.Close("reward-1");
var deckWithPick = baseline.Append(RewardCard("POMMEL_STRIKE")).ToArray();
Assert(selection.Observe(deckWithPick) is null, "An unsettled deck snapshot confirmed a selection.");
var confirmed = selection.Observe(deckWithPick);
Assert(confirmed == new RewardSelectionResult("reward-1", "POMMEL_STRIKE", false),
    "A unique candidate increase was not confirmed.");
Assert(selection.Observe(deckWithPick) is null, "The same reward emitted more than one selection.");

selection.Begin("reward-2", baseline, candidates);
selection.Close("reward-2");
Assert(selection.Observe(baseline) is null && selection.Observe(baseline) is null,
    "Skipping a reward must not emit a selection.");

selection.Begin("reward-3", baseline, candidates);
selection.Close("reward-3");
var ambiguousDeck = baseline.Concat([RewardCard("ANGER"), RewardCard("POMMEL_STRIKE")]).ToArray();
Assert(selection.Observe(ambiguousDeck) is null && selection.Observe(ambiguousDeck) is null,
    "Multiple candidate increases must remain unknown.");

selection.Begin("reward-4", baseline, candidates);
selection.Close("another-reward");
Assert(selection.Observe(deckWithPick) is null && selection.Observe(deckWithPick) is null,
    "Closing a different reward signature must not confirm a selection.");

selection.Begin("reward-5", baseline, [RewardCard("BASH", true)]);
selection.Close("reward-5");
var upgradedCandidateDeck = baseline.Append(RewardCard("BASH", true)).ToArray();
Assert(selection.Observe(upgradedCandidateDeck) is null
    && selection.Observe(upgradedCandidateDeck)?.Upgraded == true,
    "Candidate identity must include upgraded state.");

Console.WriteLine("GameBuddy reward impact codec tests passed.");
