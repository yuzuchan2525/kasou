const admin = require("firebase-admin");

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountJson) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT secret is not set.");
}

const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function makePrice(oldPrice, volatility, basePrice, pullPower, minPrice) {
  const randomMove = Math.random() * volatility * 2 - volatility;
  const pullToBase = ((basePrice - oldPrice) / basePrice) * pullPower;
  const change = randomMove + pullToBase;
  return Math.max(minPrice, oldPrice * (1 + change));
}

function makeCandle(oldPrice, newPrice, volatility) {
  const open = oldPrice;
  const close = newPrice;
  const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.4);
  const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.4);
  return { open, high, low, close, at: Date.now() };
}

async function main() {
  const ref = db.doc("game/state");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    const data = snap.exists
      ? snap.data()
      : {
          day: 1,
          btcPrice: 65000,
          lumaPrice: 1.2,
          btcCandles: [],
          lumaCandles: [],
        };

    const oldBtc = Number(data.btcPrice ?? 65000);
    const oldLuma = Number(data.lumaPrice ?? 1.2);

    let btcPrice = makePrice(oldBtc, 0.012, 65000, 0.02, 1000);
    let lumaPrice = makePrice(oldLuma, 0.03, 1.2, 0.12, 0.03);

    const eventRoll = Math.random();
    let eventText = "通常相場。";

    if (eventRoll < 0.04) {
      btcPrice *= 1.04;
      eventText = "BTCに好材料。価格が上昇。";
    } else if (eventRoll < 0.08) {
      btcPrice *= 0.965;
      eventText = "BTCに売り圧。価格が下落。";
    } else if (eventRoll < 0.15) {
      lumaPrice *= 1.08;
      eventText = "LUMAがSNSで話題に。価格が上昇。";
    } else if (eventRoll < 0.20) {
      lumaPrice *= 0.96;
      eventText = "LUMAに短期売り。価格が下落。";
    } else if (eventRoll < 0.25) {
      lumaPrice *= 1.04;
      eventText = "LUMAアップデート期待で買いが入った。";
    }

    lumaPrice = Math.max(0.03, lumaPrice);

    const btcCandles = Array.isArray(data.btcCandles) ? data.btcCandles : [];
    const lumaCandles = Array.isArray(data.lumaCandles) ? data.lumaCandles : [];

    btcCandles.push(makeCandle(oldBtc, btcPrice, 0.012));
    lumaCandles.push(makeCandle(oldLuma, lumaPrice, 0.03));

    while (btcCandles.length > 40) btcCandles.shift();
    while (lumaCandles.length > 40) lumaCandles.shift();

    tx.set(
      ref,
      {
        day: Number(data.day ?? 1) + 1,
        btcPrice,
        lumaPrice,
        btcCandles,
        lumaCandles,
        lastEvent: eventText,
        lastTickAt: Date.now(),
      },
      { merge: true }
    );
  });

  console.log("Market tick complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
