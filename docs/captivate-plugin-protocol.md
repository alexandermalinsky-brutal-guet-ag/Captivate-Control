# Captivate Plugin Bridge Protocol

Captivate-Control exposes a local TCP bridge on `127.0.0.1:45454` by default.

## Startup

1. Start the Captivate-Control desktop app.
2. Open the `GUI` page (bridge starts automatically).
3. Start your Captivate plugin and connect to `127.0.0.1:45454`.

## Frame Format

- Transport: TCP (line-delimited JSON)
- One message per line (`\n`)
- Encoding: UTF-8

## Message Schema

```json
{
  "schema": "captivate.bridge.v1",
  "messageType": "buttonTrigger",
  "sentAt": 1760000000000,
  "payload": {
    "id": "button-123",
    "label": "Animate In",
    "actionId": "animate-in",
    "captivateLayer": "layer-1",
    "captivateTarget": "captivate.gui.button",
    "sourceTable": "button_layers",
    "enabled": true,
    "triggeredAt": 1760000000000
  }
}
```

## Additional Message Types (Future Ready)

### `dataPush`

Use this to send variable/data updates from the app into Captivate later:

```json
{
  "schema": "captivate.bridge.v1",
  "messageType": "dataPush",
  "sentAt": 1760000000000,
  "payload": {
    "mode": "input",
    "target": "Scoreboard Input",
    "action": "update",
    "variables": {
      "HomeScore": "3",
      "AwayScore": "2"
    }
  }
}
```

### `command`

Generic pass-through command channel:

```json
{
  "schema": "captivate.bridge.v1",
  "messageType": "command",
  "sentAt": 1760000000000,
  "payload": {
    "command": "getTitlesPlayStatus",
    "parameters": {},
    "variables": {}
  }
}
```

## Action IDs

- `animate-in-out`
- `animate-in`
- `animate-out`
- `cut-in`
- `cut-out`
- `table-select`

## Reference Connector

Use `tools/captivate-plugin-starter.js` as a temporary plugin connector:

```bash
node tools/captivate-plugin-starter.js
```

Then click a GUI button (outside edit mode) to confirm trigger delivery.

## Captivate Integration Scaffold

Use the plugin scaffold in `tools/captivate-plugin`:

1. `connector-core.js`: TCP client + reconnect + action dispatch.
2. `captivate-api-adapter.example.js`: replace TODOs with real Captivate API calls.
3. `index.js`: plugin entrypoint.

Run it locally:

```bash
node tools/captivate-plugin/index.js
```

When integrating inside Captivate, keep the same adapter method names:

- `animateIn(layer, target)`
- `animateOut(layer, target)`
- `cutIn(layer, target)`
- `cutOut(layer, target)`
- `tableSelect(layer, target, sourceTable)`

Then wire those methods to Captivate's real layer/scene/data APIs.

## Captivate Native Plugin

You can install a Captivate-native plugin that connects directly to your app bridge:

- Source plugin: `tools/captivate-plugin/captivate-control-bridge.plugin.js`
- Installer script: `tools/captivate-plugin/install-to-captivate.sh`

Install command:

```bash
sudo ./tools/captivate-plugin/install-to-captivate.sh
```

After install, restart NewBlue Captivate.

## Configure In NewBlue Captivate

1. Install plugin
- Run: `sudo ./tools/captivate-plugin/install-to-captivate.sh`

2. Restart Captivate completely
- Quit Captivate and open it again.
- Plugin load path used by Captivate:
  `/Library/Application Support/NewBlue/Titler Content/Resources/Service Handlers/NodeRuntime/plugins`

3. Open your Captivate project
- Ensure your graphic layers exist in the project.
- Captivate-Control reads layer names from `getTitlesPlayStatus`.

4. In Captivate-Control GUI button popup
- `Captivate Layer` dropdown now uses real layer names coming from Captivate.
- `Captivate Target` mapping rules:
  - `input:YourInputName` -> targets Titler input/controller
  - `title:YourLayerName` -> targets exact layer title
  - plain value (no prefix) -> treated as input name

5. Action mapping used by plugin
- `Animate In/Out` -> `auto`
- `Animate In` -> `in`
- `Animate Out` -> `out`
- `Cut In` -> `takein`
- `Cut Out` -> `stop`

6. Later data sending
- Supported now via bridge `dataPush` message type.
- This allows pushing variables/table values without changing the plugin architecture.
