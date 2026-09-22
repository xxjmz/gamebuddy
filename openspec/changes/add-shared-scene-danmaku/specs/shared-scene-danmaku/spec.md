## Purpose

为同一类杀戮尖塔 2 场景中的自愿参与者提供短暂、匿名、可审核的共享观战弹幕，同时最小化游戏状态和个人数据的外发。

## ADDED Requirements

### Requirement: Players can opt in to a shared scene danmaku room
The application SHALL require an explicit user opt-in before connecting to a shared danmaku service or sending player-authored messages. It MUST keep local Mod-fact and local corpus danmaku functional when sharing is disabled or unavailable.

#### Scenario: Sharing is disabled by default
- **WHEN** the user has not enabled shared danmaku
- **THEN** the application MUST NOT connect to the shared service
- **AND** MUST NOT transmit game or player data

#### Scenario: Relay is unavailable
- **WHEN** a user has opted in and the shared service disconnects or is unreachable
- **THEN** the application SHALL show a non-blocking unavailable state
- **AND** local danmaku MUST continue without delay

### Requirement: Shared rooms use a privacy-minimized scene signature
The application SHALL match opted-in players using only a coarse scene signature consisting of game version, character, act/floor, room type and sorted active enemy identities. It MUST NOT include a run seed, player health, hand, deck, relics, player memory, recommendation, or full observation payload.

#### Scenario: Equivalent public scenes are matched
- **WHEN** two opted-in players have the same coarse scene signature
- **THEN** their messages SHALL be eligible for delivery to the same shared room

#### Scenario: Sensitive state remains local
- **WHEN** the application joins or posts to a shared room
- **THEN** the outbound payload MUST exclude all prohibited private fields

### Requirement: Shared messages are bounded and visibly attributable
The application SHALL accept only short player-authored text and render received messages with a `player` source label distinct from Mod facts, Bilibili corpus messages, and original local wording. Messages MUST expire and MUST NOT become strategy input.

#### Scenario: A valid player message is delivered
- **WHEN** an opted-in player sends a valid message for the current room
- **THEN** other opted-in players in that room SHALL receive it without a sender identity and with an expiration

#### Scenario: Player messages do not affect advice
- **WHEN** a player message is received
- **THEN** it MUST NOT alter a recommendation, game state, scene trigger, or player-memory record

### Requirement: Shared danmaku is abuse-limited
The shared service SHALL enforce text length and rate limits, reject malformed or filtered messages, and retain no room message history after its delivery window expires. The application MUST offer a local way to hide player messages for the current session.

#### Scenario: Flooding is rejected
- **WHEN** a sender exceeds the configured room message rate
- **THEN** the service MUST reject the excess messages without disconnecting other clients

#### Scenario: Player messages are hidden locally
- **WHEN** the user hides shared player messages
- **THEN** subsequently received `player` messages MUST NOT be rendered
- **AND** local Mod-fact and local corpus messages remain visible
