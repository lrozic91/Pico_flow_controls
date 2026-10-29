# PFCLedger na ZKsync testnetu

Pametni ugovor koji simulira PFC-ovo poslovanje: narudžba, servis, alarm eLBC-a, račun, plaćanje.
Na lanac idu samo brojevi, iznosi i otisci (hash) dokumenata; podaci su izmišljeni.

1. `npm install`
2. `node simulate.js` – napravi 4 **testna** novčanika: PFC, tehničar, kupac 1, kupac 2 (ključevi u `.env`, ne dijeliti, ne koristiti za pravi novac) i ispiše PFC adresu
3. Na faucetu pošalji testni ETH samo na PFC adresu (ZKsync Era Testnet, chain ID 312; ETH se prenosi sa Sepolije preko https://portal.zksync.io/bridge)
4. `node simulate.js` – objavi ugovor, dodijeli uloge tehničaru i kupcima, podijeli im malo ETH-a za plin i odradi 4 posla; adresa ide u `deployment.json`

Druga mreža: `RPC=https://zksync-os-testnet-alpha.zksync.dev/ node simulate.js` (ZKsync OS testnet, chain ID 8022833).
