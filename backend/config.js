// Mapeamento de dispositivo → tópico MQTT e payloads de comando
const DEVICE_MQTT = {
  'sala-luz':   { topic: 'casa/luz/comando',        on: 'ON',      off: 'OFF'       },
  'ventilador': { topic: 'casa/ventilador/comando', on: 'ON',      off: 'OFF'       },
  'porta':      { topic: 'casa/porta/comando',      on: 'ABRIR',   off: 'FECHAR'    },
  'alarme':     { topic: 'casa/alarme/comando',     on: 'ATIVAR',  off: 'DESATIVAR' },
}

module.exports = { DEVICE_MQTT }
