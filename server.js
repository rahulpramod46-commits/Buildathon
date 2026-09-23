const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

// Serve static files: prefer `public` folder if present, otherwise serve project root
const staticDir = path.join(__dirname, 'public');
if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
} else {
    app.use(express.static(__dirname));
}

// =====================
// MongoDB Connection
// =====================
// Attempt MongoDB connection, but don't prevent the server from starting if it fails
async function connectMongo() {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('MongoDB Connected');
    } catch (err) {
        console.warn('Warning: MongoDB connection failed — continuing without DB.');
        console.warn(err && err.message ? err.message : err);
    }
}

// =====================
// Registration Schema
// =====================
const registrationSchema = new mongoose.Schema({

    registrationId: String,

    teamName: String,

    teamSize: String,

    leaderName: String,

    hallticket: String,

    email: String,

    phone: String,

    department: String,

    year: String,

    domain: String,

    idea: String,

    paymentStatus: {
        type: String,
        default: 'Pending'
    },

    amount: {
        type: Number,
        default: 200
    },

    paymentDate: String

});

const Registration = mongoose.model('Registration', registrationSchema);

// =====================
// Email Transport
// =====================
const transporter = nodemailer.createTransport({

    service: 'gmail',

    auth: {

        user: process.env.EMAIL,

        pass: process.env.PASSWORD

    }

});

// =====================
// Registration Route
// =====================
app.post('/register', async (req, res) => {

    try {

        const registrationId = 'BLD2026-' + Date.now();

        const registration = new Registration({

            ...req.body,

            registrationId

        });

        await registration.save();

        res.json({

            success: true,

            registrationId

        });

    } catch (err) {

        console.log(err);

        res.status(500).json({

            success: false,

            message: 'Registration failed'

        });

    }

});

// =====================
// Payment Success Route
// =====================
app.post('/payment-success', async (req, res) => {

    try {

        const { registrationId } = req.body;

        const registration = await Registration.findOne({ registrationId });

        if (!registration) {

            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });

        }

        registration.paymentStatus = 'Paid';
        registration.paymentDate = new Date().toLocaleString();

        await registration.save();

        // =====================
        // Generate Receipt PDF
        // =====================

        const receiptPath = path.join(__dirname, `receipt-${registrationId}.pdf`);

        const doc = new PDFDocument();

        doc.pipe(fs.createWriteStream(receiptPath));

        doc.fontSize(22).text('DRK Institute of Science & Technology', { align: 'center' });

        doc.moveDown();

        doc.fontSize(18).text('Buildathon 2026 Payment Receipt', { align: 'center' });

        doc.moveDown();

        doc.fontSize(12);

        doc.text(`Registration ID: ${registration.registrationId}`);
        doc.text(`Team Name: ${registration.teamName}`);
        doc.text(`Team Leader: ${registration.leaderName}`);
        doc.text(`Email: ${registration.email}`);
        doc.text(`Department: ${registration.department}`);
        doc.text(`Year: ${registration.year}`);
        doc.text(`Domain: ${registration.domain}`);
        doc.text(`Amount Paid: Rs. ${registration.amount}`);
        doc.text(`Payment Status: PAID`);
        doc.text(`Date: ${registration.paymentDate}`);

        doc.moveDown();

        doc.text('Thank you for registering for Buildathon 2026.', { align: 'center' });

        doc.end();

        // =====================
        // Send Email
        // =====================

        await transporter.sendMail({

            from: process.env.EMAIL,

            to: registration.email,

            subject: 'Buildathon 2026 Registration & Payment Confirmation',

            html: `
            <h2>Payment Successful</h2>

            <p>Dear <b>${registration.leaderName}</b>,</p>

            <p>Your registration for <b>Buildathon 2026</b> has been confirmed.</p>

            <table border="1" cellpadding="10">
                <tr><td>Registration ID</td><td>${registration.registrationId}</td></tr>
                <tr><td>Team Name</td><td>${registration.teamName}</td></tr>
                <tr><td>Amount Paid</td><td>Rs. ${registration.amount}</td></tr>
                <tr><td>Payment Status</td><td>PAID</td></tr>
                <tr><td>Date</td><td>${registration.paymentDate}</td></tr>
            </table>

            <p>The payment receipt is attached with this email.</p>

            <p><b>Venue:</b> Seminar Hall, Main Block<br>
            <b>Time:</b> 09:00 AM</p>

            <p>Regards,<br>
            Buildathon 2026 Organizing Team</p>
            `,

            attachments: [
                {
                    filename: `Buildathon_Receipt_${registration.registrationId}.pdf`,
                    path: receiptPath
                }
            ]

        });

        res.json({

            success: true,

            message: 'Payment confirmed and email sent'

        });

    } catch (err) {

        console.log(err);

        res.status(500).json({

            success: false,

            message: 'Payment processing failed'

        });

    }

});

// =====================
// Download Receipt
// =====================
app.get('/receipt/:id', async (req, res) => {

    const registration = await Registration.findOne({

        registrationId: req.params.id

    });

    if (!registration) {

        return res.status(404).send('Receipt not found');

    }

    const receiptPath = path.join(__dirname, `receipt-${registration.registrationId}.pdf`);

    if (fs.existsSync(receiptPath)) {

        res.download(receiptPath);

    } else {

        res.status(404).send('Receipt file not found');

    }

});

// Explicitly serve index.html at root to avoid "Cannot GET /" issues
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Diagnostic info route
app.get('/__info', (req, res) => {
    try {
        const files = fs.readdirSync(__dirname);
        res.json({ __dirname, cwd: process.cwd(), files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 5000;

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

(async () => {
    await connectMongo();

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
})();
/* =========================================
   SECTOR DATA
========================================= */

const sectorData = {

    health: {

        title: "Health Sector",

        description:
            "Create innovative solutions that improve healthcare, medical services, patient experience, and overall well-being.",

        options: [
            "AI in Healthcare",
            "Smart Healthcare Systems",
            "Disease Detection & Prevention",
            "Telemedicine",
            "Patient Management",
            "Medical Data Analytics",
            "Fitness & Wellness",
            "Mental Wellness",
            "Healthcare Accessibility",
            "Smart Medical Devices"
        ]

    },


    service: {

        title: "Service Sector",

        description:
            "Build solutions that improve everyday services, customer experiences, accessibility, and community interaction.",

        options: [
            "Smart Customer Services",
            "Digital Service Platforms",
            "Education Services",
            "Tourism & Travel",
            "Banking & FinTech Services",
            "Public Services",
            "Transport Services",
            "Food & Delivery",
            "Retail Services",
            "Community Solutions"
        ]

    },


    technical: {

        title: "Technical Sector",

        description:
            "Develop next-generation technology and engineering solutions using modern digital technologies.",

        options: [
            "Artificial Intelligence",
            "Machine Learning",
            "Web Development",
            "Mobile Development",
            "Cloud Computing",
            "Cybersecurity",
            "Internet of Things",
            "Robotics",
            "Data Science",
            "Software Engineering"
        ]

    }

};


/* =========================================
   OPEN SECTOR
========================================= */

function openSector(sector) {

    const data = sectorData[sector];

    if (!data) {
        return;
    }


    const modal =
        document.getElementById("sectorModal");

    const modalTitle =
        document.getElementById("modalTitle");

    const modalDescription =
        document.getElementById("modalDescription");

    const sectorOptions =
        document.getElementById("sectorOptions");


    /* Set title */

    modalTitle.textContent =
        data.title;


    /* Set description */

    modalDescription.textContent =
        data.description;


    /* Clear old options */

    sectorOptions.innerHTML = "";


    /* Add sector options */

    data.options.forEach(function (item) {

        const option =
            document.createElement("div");

        option.className =
            "sector-option";

        option.textContent =
            "✦ " + item;

        sectorOptions.appendChild(option);

    });


    /* Show modal */

    modal.classList.add("active");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    /* Prevent background scrolling */

    document.body.style.overflow =
        "hidden";

}


/* =========================================
   CLOSE SECTOR
========================================= */

function closeSector() {

    const modal =
        document.getElementById("sectorModal");


    modal.classList.remove("active");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );


    /* Restore scrolling */

    document.body.style.overflow =
        "";

}


/* =========================================
   CLOSE WHEN CLICKING OUTSIDE
========================================= */

const sectorModal =
    document.getElementById("sectorModal");


if (sectorModal) {

    sectorModal.addEventListener(
        "click",
        function (event) {

            if (event.target === sectorModal) {

                closeSector();

            }

        }
    );

}


/* =========================================
   CLOSE WITH ESC KEY
========================================= */

document.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Escape") {

            closeSector();

        }

    }
);