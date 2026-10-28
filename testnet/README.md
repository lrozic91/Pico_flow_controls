# PFCLedger na ZKsync testnetu

Pametni ugovor koji simulira PFC-ovo poslovanje: narudžba, servis, alarm eLBC-a, račun, plaćanje.
Na lanac idu samo brojevi, iznosi i otisci (hash) dokumenata; podaci su izmišljeni.

1. `npm install`
2. `node simulate.js` – napravi novi **testni** novčanik (ključ u `.env`, ne dijeliti, ne koristiti za pravi novac) i ispiše adresu
3. Na faucetu pošalji testni ETH na tu adresu (ZKsync Era Sepolia, chain ID 300)
4. `node simulate.js` – objavi ugovor i odradi 4 posla (18 transakcija); adresa ide u `deployment.json`

Druga mreža: `RPC=https://zksync-os-testnet-alpha.zksync.dev node simulate.js` (ZKsync OS testnet, chain ID 8022833).
