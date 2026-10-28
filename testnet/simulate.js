// Simulacija PFC-ova poslovanja na ZKsync testnetu.
// 1. prvo pokretanje: napravi novi testni novčanik i spremi ga u .env (samo za testnet!)
// 2. pošalji testni ETH na ispisanu adresu (faucet)
// 3. drugo pokretanje: objavi ugovor i odradi nekoliko narudžbi: narudžba -> servis -> alarm -> račun -> plaćanje
// Pokretanje: npm i ethers@6 && node simulate.js
const fs = require("fs"), path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.RPC || "https://zksync-os-testnet-alpha.zksync.dev/";  // ZKsync OS testnet (chain ID 8022833)
const ENV = path.join(__dirname, ".env");
const OUT = path.join(__dirname, "deployment.json");
const art = JSON.parse(fs.readFileSync(path.join(__dirname, "PFCLedger.json"), "utf8"));
const id = s => ethers.id(s);   // otisak (keccak256) dokumenta ili oznake stanice

// kupac 1 ima stanice MRS-A i MRS-B, kupac 2 stanicu BVS-C
const ORDERS = [
  { station: "MRS-A", cust: "CUST1", what: "Godisnji servis MRS-A", amount: 4800_00, alarm: null },
  { station: "MRS-B", cust: "CUST1", what: "Kalibracija LBC uredaja MRS-B", amount: 1250_00, alarm: 3 },
  { station: "BVS-C", cust: "CUST2", what: "Zamjena eLBC baterije BVS-C", amount: 690_00, alarm: 1 },
  { station: "MRS-A", cust: "CUST1", what: "Popravak regulatora MRS-A", amount: 2340_00, alarm: null },
];
const ROLE = { Technician: 2, Customer: 3 };
const NAMES = ["PRIVATE_KEY", "TECH_KEY", "CUST1_KEY", "CUST2_KEY"];

async function main() {
  if (!fs.existsSync(ENV)) {
    const ws = NAMES.map(() => ethers.Wallet.createRandom());
    fs.writeFileSync(ENV, NAMES.map((n, i) => `${n}=${ws[i].privateKey}`).join("\n") + "\n", { mode: 0o600 });
    console.log("Napravljena 4 TESTNA novcanika: PFC, tehnicar, kupac 1, kupac 2 (kljucevi su u .env, ne dijeli ih i ne koristi za pravi novac).");
    console.log("Posalji testni ETH samo na PFC adresu:", ws[0].address);
    return;
  }
  const env = fs.readFileSync(ENV, "utf8");
  const provider = new ethers.JsonRpcProvider(RPC);
  const W = Object.fromEntries(NAMES.map(n => [n.replace("_KEY", "").replace("PRIVATE", "PFC"), new ethers.Wallet(env.match(new RegExp(n + "=(0x[0-9a-fA-F]{64})"))[1], provider)]));
  const wallet = W.PFC;
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
  const as = w => c.connect(w);
  let gas = 0n, n = 0;
  const send = async (label, p) => { const r = await (await p).wait(); gas += r.gasUsed * (r.gasPrice ?? r.effectiveGasPrice ?? 0n); n++; console.log(" ", label, r.hash); return r; };
  if (!dep.roles) {
    // uloge i malo ETH-a za plin na adrese tehnicara i kupaca (s PFC adrese)
    const share = (await provider.getBalance(wallet.address)) / 10n;
    for (const [k, role] of [["TECH", ROLE.Technician], ["CUST1", ROLE.Customer], ["CUST2", ROLE.Customer]]) {
      await send("uloga " + k, c.setRole(W[k].address, role));
      await send("ETH za plin " + k, wallet.sendTransaction({ to: W[k].address, value: share }));
    }
    dep.roles = { pfc: wallet.address, tech: W.TECH.address, cust1: W.CUST1.address, cust2: W.CUST2.address };
    fs.writeFileSync(OUT, JSON.stringify(dep, null, 1));
  }
  for (const o of ORDERS) {
    console.log(o.what);
    const cust = W[o.cust];
    const r = await send("narudzba (PFC)", c.createOrder(id(o.station), cust.address, id("narudzba:" + o.what)));
    const oid = c.interface.parseLog(r.logs[0]).args.id;
    await send("servis (tehnicar)", as(W.TECH).logService(oid, id("zapisnik:" + o.what)));
    if (o.alarm) await send("alarm eLBC (tehnicar)", as(W.TECH).logAlarm(id(o.station), o.alarm, id("alarm:" + o.station + ":" + o.alarm)));
    await send("racun (PFC)", c.issueInvoice(oid, o.amount, id("racun:" + o.what)));
    await send("placanje (" + o.cust.toLowerCase() + ")", as(cust).confirmPayment(oid));
  }
  dep.txCount = (dep.txCount || 0) + n;
  dep.feeWei = (BigInt(dep.feeWei || 0) + gas).toString();
  fs.writeFileSync(OUT, JSON.stringify(dep, null, 1));
  console.log(`Gotovo: ${n} transakcija, ukupna naknada ${ethers.formatEther(gas)} ETH. Podaci u deployment.json`);
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
