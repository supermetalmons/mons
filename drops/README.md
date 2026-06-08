# Drop Metadata JSON

Use a flat `json/` directory for drop item metadata when possible:

- `b1.json` ... `bN.json`: pack NFTs
- `f1.json` ... `fN.json`: card/figure NFTs
- `rb1.json` ... `rbN.json`: redeemed pack receipt NFTs
- `rf1.json` ... `rfN.json`: redeemed card/figure receipt NFTs

IDs reset per group and must match the filename number. Example: `f12.json` has `"id": 12`.

## Required Fields

Each item JSON should include:

- `id`: numeric suffix for that group
- `name`: display name, usually `Pack #n`, `Card #n`, `Pack #n Receipt`, or `Card #n Receipt`
- `description`: short drop description, or `redeemed on mons dot shop` for receipts
- `image`: full asset URL
- `external_url`: `https://mons.shop`
- `attributes`: at minimum `type` and `redeemed`
- `properties.files`: one or more asset entries
- `properties.category`: usually `image`, or `video` when animation/video is primary

## Standard Attributes

Use lowercase trait names for current drops:

```json
[
  { "trait_type": "type", "value": "3 card pack" },
  { "trait_type": "redeemed", "value": false }
]
```

Common `type` values:

- `3 card pack`
- `card`
- `pack receipt`
- `card receipt`

Receipts must use `"redeemed": true`; unredeemed packs/cards must use `"redeemed": false`.

## Asset Properties

`properties.files[0].uri` should match `image`, and image assets should use:

```json
{
  "uri": "https://assets.mons.link/drops/<drop>/<asset>.webp",
  "type": "image/webp"
}
```

Keep item files focused on item metadata. Collection-only fields like `symbol`, `seller_fee_basis_points`, and `properties.creators` belong in `collection.json`, not every item JSON.
