using System.Text.Json;

namespace GameBuddyBridge.Scripts;

internal sealed record DraftArchetypeImpact(string Id, int DeltaPoints, string? Reason, int? BeforeScore = null);
internal sealed record DraftCardImpact(
    string CardId,
    int DeltaPoints,
    string? Reason,
    IReadOnlyList<DraftArchetypeImpact> Archetypes);
internal sealed record DraftImpactMessage(string Signature, IReadOnlyDictionary<string, DraftCardImpact> Impacts);

internal static class GameBuddyRewardImpactCodec
{
    internal static readonly string[] ArchetypeIds = ["auto_strike", "exhaust", "strength", "block"];
    private static readonly string[] ChineseNames = ["自动打击", "消耗引擎", "力量叠加", "格挡壁垒"];
    private static readonly string[] EnglishNames = ["Auto Strike", "Exhaust", "Strength", "Block"];

    internal static bool TryParse(string json, out DraftImpactMessage? message)
    {
        message = null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!root.TryGetProperty("type", out var typeElement)
                || typeElement.GetString() != "draft_impact"
                || !root.TryGetProperty("signature", out var signatureElement)
                || !root.TryGetProperty("impacts", out var impactsElement)
                || impactsElement.ValueKind != JsonValueKind.Array
                || impactsElement.GetArrayLength() is < 1 or > 6) return false;

            var signature = signatureElement.GetString();
            if (string.IsNullOrWhiteSpace(signature) || signature.Length > 1024) return false;

            var impacts = new Dictionary<string, DraftCardImpact>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in impactsElement.EnumerateArray())
            {
                if (!TryParseCard(item, out var impact) || impact is null
                    || !impacts.TryAdd(impact.CardId, impact)) return false;
            }

            message = new DraftImpactMessage(signature, impacts);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    internal static string FormatLine(DraftArchetypeImpact impact, bool useChinese)
    {
        var index = Array.IndexOf(ArchetypeIds, impact.Id);
        if (index < 0) throw new ArgumentOutOfRangeException(nameof(impact), "Unknown archetype ID.");
        var name = (useChinese ? ChineseNames : EnglishNames)[index];
        var sign = impact.DeltaPoints > 0 ? "+" : string.Empty;
        if (impact.BeforeScore is int before)
            return $"{name} {before}% {sign}{impact.DeltaPoints}";
        return $"{name} {sign}{impact.DeltaPoints}%";
    }

    private static bool TryParseCard(JsonElement item, out DraftCardImpact? impact)
    {
        impact = null;
        if (item.ValueKind != JsonValueKind.Object
            || !item.TryGetProperty("cardId", out var cardIdElement)
            || !item.TryGetProperty("deltaPoints", out var deltaElement)
            || !deltaElement.TryGetInt32(out var legacyDelta)
            || !IsAllowedDelta(legacyDelta)
            || !item.TryGetProperty("archetypes", out var archetypesElement)
            || archetypesElement.ValueKind != JsonValueKind.Array
            || archetypesElement.GetArrayLength() != ArchetypeIds.Length) return false;

        var cardId = cardIdElement.GetString();
        if (string.IsNullOrWhiteSpace(cardId) || cardId.Length > 128) return false;

        var byId = new Dictionary<string, DraftArchetypeImpact>(StringComparer.Ordinal);
        foreach (var archetypeElement in archetypesElement.EnumerateArray())
        {
            if (archetypeElement.ValueKind != JsonValueKind.Object
                || !archetypeElement.TryGetProperty("id", out var idElement)
                || !archetypeElement.TryGetProperty("deltaPoints", out var archetypeDeltaElement)
                || !archetypeDeltaElement.TryGetInt32(out var archetypeDelta)
                || !IsAllowedDelta(archetypeDelta)) return false;

            var id = idElement.GetString();
            if (id is null || Array.IndexOf(ArchetypeIds, id) < 0) return false;
            string? reason = null;
            if (archetypeElement.TryGetProperty("reason", out var reasonElement))
            {
                if (reasonElement.ValueKind != JsonValueKind.String) return false;
                reason = reasonElement.GetString();
            }
            int? beforeScore = null;
            if (archetypeElement.TryGetProperty("beforeScore", out var beforeElement))
            {
                if (!beforeElement.TryGetInt32(out var before) || before is < 0 or > 100) return false;
                beforeScore = before;
            }
            if (!byId.TryAdd(id, new DraftArchetypeImpact(id, archetypeDelta, reason, beforeScore))) return false;
        }

        var ordered = ArchetypeIds.Select(id => byId[id]).ToArray();
        if (legacyDelta != ordered[0].DeltaPoints) return false;

        string? legacyReason = null;
        if (item.TryGetProperty("reason", out var legacyReasonElement))
        {
            if (legacyReasonElement.ValueKind != JsonValueKind.String) return false;
            legacyReason = legacyReasonElement.GetString();
        }
        impact = new DraftCardImpact(cardId, legacyDelta, legacyReason, ordered);
        return true;
    }

    private static bool IsAllowedDelta(int delta) => delta is >= -100 and <= 100;
}
