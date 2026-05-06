# Captivate Control Data Controller

This folder contains a minimal custom Captivate data controller that connects to the local Captivate Control data API.

## What it does

- Shows up in Captivate's Data Controller menu as `Captivate Control: Data API Browser`
- Fetches available tables from `http://127.0.0.1:45455`
- Lets you pick a table and row inside Captivate
- Dynamically redefines the controller variables to match the selected table's columns
- Sends the selected row into any title connected to this input

## Install on macOS

1. Make sure Captivate is closed.
2. Copy the folder `Captivate Control` into:

```text
/Users/Shared/NewBlue/LiveEngine/DataControllers
```

Filepath - (Exclusivly works on mac)

3. Restart Captivate.
4. In Captivate, pick the data controller:

```text
Captivate Control: Data API Browser
```lo

## Install with script

Run:

```bash
tools/captivate-data-controller/install-to-captivate.sh
```

## Usage

1. Start Captivate Control so the local API is running on `127.0.0.1:45455`.
2. In Captivate, assign `Captivate Control: Data API Browser` to a title.
3. In the controller UI, click `Refresh`.
4. Select a table. The controller updates the input definition to match that table's columns.
5. Drag the generated variables in Captivate's preview onto the corresponding text/image fields in your title.
6. Select a row in the controller and use `Play`, `Update`, or `Play Out`.

## Notes

- Captivate only reads XML controller definitions at launch, so restart Captivate after changing `controller.xml`.
- The controller uses plain browser JavaScript because Captivate's built-in HTTP server does not provide a secure context for ES modules.
