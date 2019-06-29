const { TardisMachine } = require('tardis-machine');
const BitMEXClient = require('bitmex-realtime-api');
const PORT = 8072;
const WS_REPLAY_URL = `ws://localhost:${PORT}/ws-replay?exchange=bitmex&from=2019-06-01&to=2019-06-01 02:00`;
// tardis machine can be run via CLI or inside Docker container as well - https://github.com/tardis-dev/tardis-machine
const tardisMachine = new TardisMachine({ cacheDir: './.cache' });

async function runTardisMachineWithBitMEXOfficialClient() {
  await tardisMachine.run(PORT);

  // only change required for BitMEX client is to point it to tardis-machine 'replay' endpoint
  const officialBitMEXClient = new BitMEXClient({ endpoint: WS_REPLAY_URL });

  officialBitMEXClient.addStream('ADAM19', 'trade', function(data, symbol, tableName) {
    if (!data.length) return;

    const trade = data[data.length - 1]; // the last data element is the newest trade
    console.log(trade);
  });

  await new Promise(resolve => officialBitMEXClient.on('end', resolve));
  await tardisMachine.stop();
}

await runTardisMachineWithBitMEXOfficialClient();
