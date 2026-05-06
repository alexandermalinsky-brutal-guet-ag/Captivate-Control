const DEFAULT_TITLER_WS_PORT = 9023;
const DEFAULT_TITLER_HTTP_PORT = 8022;

/**
 * Helper for connecting to Titler Live server and providing API endpoints.
 */
const ServiceHandler = {
  DEBUGMODE: true, // set to true to enable printing debugging information to console; set to false in release

  /**
   * Scheduler API object. Available after onready() callback fires.  */
  scheduler: undefined,

  /**
   * Web socket server url used to communicate with the server (i.e. "ws://localhost:4321") */
  serverUrl: undefined,

  /**
   * Name of this input, pulled from the url */
  inputName: undefined,

  /**
   * Name of the host app, pulled from the url */
  hostName: undefined,

  /**
   * User callback to execute when connection to server is established. */
  onready: function () {},

  /**
   * User callback to execute when connection to server is terminated. */
  onclose: function () {},

  /**
   * User callback to execute when an error is encountered trying to communicate with the server. */
  onerror: function (error) {},

  /**
   * Reports the ready state. */
  readyState: 'disconnected',

  /**
   * Initializes the connection to the Titler Live API server. */
  init: function (url) {
    // Start by reading parameters from the url that launched this.
    const queryString = window.location.search;
    let urlParams = new URLSearchParams(queryString);
    let serverPort = urlParams.get('port') ?? DEFAULT_TITLER_WS_PORT;
    ServiceHandler.queryVars = Object.fromEntries(urlParams);
    ServiceHandler.inputName = urlParams.get('inputName') ?? '';
    ServiceHandler.hostName = urlParams.get('hostName') ?? urlParams.get('ip') ?? window.location.hostname;
    ServiceHandler.wsPort = serverPort;
    ServiceHandler.httpPort = urlParams.get('httpPort') ?? DEFAULT_TITLER_HTTP_PORT;
    ServiceHandler.httpUrl = `http://${ServiceHandler.hostName}:${ServiceHandler.httpPort}`;
    if (typeof url === 'undefined') {
      // Use the local server environment as the socket server.
      // When hosted by the Titler HTTP server, socket port is stored as a global session cookie.
      let cookie = document.cookie.match(/channel=([0-9]+)/);
      if (cookie) {
        serverPort = cookie[1];
      }
      if (serverPort != '') {
        ServiceHandler.serverUrl = 'ws://' + ServiceHandler.hostName + ':' + serverPort;
      } else {
        console.error('No server cookie or url argument for websocket found');
      }
    } else {
      // Done, we've been passed the websocket directly.
      ServiceHandler.serverUrl = url;
    }

    if (ServiceHandler.DEBUGMODE) {
      console.log('Connecting to', ServiceHandler.serverUrl);
    }

    let socket = new WebSocket(ServiceHandler.serverUrl);
    ServiceHandler.readyState = socket.readyState;
    socket.onclose = function () {
      ServiceHandler.readyState = socket.readyState;
      if (ServiceHandler.DEBUGMODE) console.warn('WebSocket closed');
      if (typeof ServiceHandler.onclose === 'function') ServiceHandler.onclose();
    };

    socket.onerror = function (error) {
      ServiceHandler.readyState = socket.readyState;
      if (ServiceHandler.DEBUGMODE) console.error('WebSocket error', error);
      if (typeof ServiceHandler.onerror === 'function') ServiceHandler.onerror(error);
    };

    socket.onopen = function () {
      ServiceHandler.readyState = socket.readyState;
      if (ServiceHandler.DEBUGMODE) console.log('WebSocket connected, setting up QWebChannel');

      // Establish API connection.
      new QWebChannel(socket, function (channel) {
        if (ServiceHandler.DEBUGMODE) console.log('QWebChannel connected');
        ServiceHandler.scheduler = channel.objects.scheduler;
        ServiceHandler.makePromises();
        if (typeof ServiceHandler.onready === 'function') ServiceHandler.onready();
      });
    };
  },

  makePromises: function () {
    let s = ServiceHandler.scheduler;
    ServiceHandler.commandXml = (command) => ServiceHandler._promised(s.scheduleCommandXml, [command]);
    ServiceHandler.command = (command, params = {}, variables = {}) => ServiceHandler._promised(s.scheduleCommand, [command, params, variables]);
    ServiceHandler.action = (action, input = '', title = '', variables = {}) => ServiceHandler._promised(s.scheduleAction, [action, input, title, variables]);
    ServiceHandler.loadSettings = (input) => ServiceHandler._promised(s.loadSettings, [input]);
    ServiceHandler.saveSettings = (input, settingsString = '') => ServiceHandler._promised(s.saveSettings, [input, settingsString]);
  },

  _promised: function (fn, args) {
    return new Promise((resolve, _) => {
      fn(...args, (reply) => {
        resolve(reply)
      })
    })
  }
};
