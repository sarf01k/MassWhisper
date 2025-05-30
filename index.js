const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require("baileys");
const pino = require("pino");
const fs = require("fs");
const csv = require("csv-parser");
const { text } = require("stream/consumers");

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

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendInBatches(
    socket,
    contacts,
    imageBuffer,
    batchSize = 20,
    delayMs = 2000
) {
    for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        await Promise.all(
            batch.map((contact) =>
                socket.sendMessage(contact, {
                    // image: imageBuffer,
                    // caption:
                    //     "caption",
                    text: "message",
                })
            )
        );
        console.log(`- Sent batch ${i / batchSize + 1}`);
        await delay(delayMs);
    }
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

                const contacts = await readContactsFromCSV("contacts.csv");

                const imageBuffer = fs.readFileSync("image.jpg");

                await sendInBatches(socket, contacts, imageBuffer);

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
