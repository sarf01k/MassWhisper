const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require("baileys");
const pino = require("pino");
const fs = require("fs");
const csv = require("csv-parser");

async function readContactsFromCSV(filePath) {
    const contacts = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (row) => {
                // Assuming the CSV format is: name, phone
                contacts.push(`${row.Phone}@s.whatsapp.net`);
            })
            .on("end", () => {
                resolve(contacts);
            })
            .on("error", (error) => {
                reject(error);
            });
    });
}

async function startSocket() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const socket = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
    });

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update) => {
        try {
            const { connection, lastDisconnect } = update;

            if (connection == "close") {
                const reason = lastDisconnect?.error?.output?.statusCode;

                if (reason === DisconnectReason.loggedOut) {
                    console.error(
                        "🚪 You have been logged out.\nPlease delete 'auth_info' folder or re-scan the QR code below."
                    );
                }

                console.log("🔄️ Reconnecting...");
                startSocket();
            } else if (connection == "open") {
                console.log("✅ Connected to WhatsApp.");

                const contacts = await readContactsFromCSV("example.csv");

                const imageBuffer = fs.readFileSync("ak.jpg");

                for (const contact of contacts) {
                    await socket.sendMessage(contact, {
                        image: imageBuffer,
                        caption:
                            "📸 Check out this cool video:\nhttps://www.youtube.com",
                    });
                }
                console.log(`📤 Message sent.`);

                process.exit(0);
            }
        } catch (error) {
            console.error("An unexpected error occured:", error);
            process.exit(0);
        }
    });
}

startSocket();
