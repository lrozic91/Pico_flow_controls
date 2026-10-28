// Simulacija PFC-ova poslovanja na ZKsync testnetu.
// 1. prvo pokretanje: napravi novi testni novčanik i spremi ga u .env (samo za testnet!)
// 2. pošalji testni ETH na ispisanu adresu (faucet)
// 3. drugo pokretanje: objavi ugovor i odradi nekoliko narudžbi: narudžba -> servis -> alarm -> račun -> plaćanje
// Pokretanje: npm i ethers@6 && node simulate.js
const fs = require("fs"), path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.RPC || "https://sepolia.era.zksync.dev";
const ENV = path.join(__dirname, ".env");
const OUT = path.join(__dirname, "deployment.json");
const art = JSON.parse(fs.readFileSync(path.join(__dirname, "PFCLedger.json"), "utf8"));
const id = s => ethers.id(s);   // otisak (keccak256) dokumenta ili oznake stanice

const ORDERS = [
  { station: "MRS-A", what: "Godisnji servis MRS-A", amount: 4800_00, alarm: null },
  { station: "MRS-B", what: "Kalibracija LBC uredaja MRS-B", amount: 1250_00, alarm: 3 },
  { station: "BVS-C", what: "Zamjena eLBC baterije BVS-C", amount: 690_00, alarm: 1 },
  { station: "MRS-A", what: "Popravak regulatora MRS-A", amount: 2340_00, alarm: null },
];

async function main() {
  if (!fs.existsSync(ENV)) {
    const w = ethers.Wallet.createRandom();
    fs.writeFileSync(ENV, `PRIVATE_KEY=${w.privateKey}\n`, { mode: 0o600 });
    console.log("Napravljen novi TESTNI novcanik (kljuc je u .env, ne dijeli ga i ne koristi za pravi novac).");
    console.log("Posalji testni ETH na adresu:", w.address);
    return;
  }
  const key = fs.readFileSync(ENV, "utf8").match(/PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(key, provider);
  const net = await provider.getNetwork();
  const bal = await provider.getBalance(wallet.address);
  console.log("Mreza", net.chainId.toString(), "adresa", wallet.address, "stanje", ethers.formatEther(bal), "ETH");
  if (bal === 0n) return console.log("Stanje je 0: prvo posalji testni ETH na adresu.");

  let dep = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  if (!dep || dep.chainId !== net.chainId.toString()) {
    const f = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
    const c = await f.deploy();
    const r = await c.deploymentTransaction().wait();
    dep = { chainId: net.chainId.toString(), rpc: RPC, address: await c.getAddress(), fromBlock: r.blockNumber, tx: r.hash };
    fs.writeFileSync(OUT, JSON.stringify(dep, null, 1));
    console.log("Ugovor objavljen:", dep.address, "blok", dep.fromBlock);
  }
  const c = new ethers.Contract(dep.address, art.abi, wallet);
  let gas = 0n, n = 0;
  const send = async (label, p) => { const r = await (await p).wait(); gas += r.gasUsed * (r.gasPrice ?? r.effectiveGasPrice ?? 0n); n++; console.log(" ", label, r.hash); return r; };
  for (const o of ORDERS) {
    console.log(o.what);
    const r = await send("narudzba", c.createOrder(id(o.station), wallet.address, id("narudzba:" + o.what)));
    const oid = c.interface.parseLog(r.logs[0]).args.id;
    await send("servis", c.logService(oid, id("zapisnik:" + o.what)));
    if (o.alarm) await send("alarm eLBC", c.logAlarm(id(o.station), o.alarm, id("alarm:" + o.station + ":" + o.alarm)));
    await send("racun", c.issueInvoice(oid, o.amount, id("racun:" + o.what)));
    await send("placanje", c.confirmPayment(oid));
  }
  dep.txCount = (dep.txCount || 0) + n;
  dep.feeWei = (BigInt(dep.feeWei || 0) + gas).toString();
  fs.writeFileSync(OUT, JSON.stringify(dep, null, 1));
  console.log(`Gotovo: ${n} transakcija, ukupna naknada ${ethers.formatEther(gas)} ETH. Podaci u deployment.json`);
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
