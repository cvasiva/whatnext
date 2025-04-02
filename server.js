const express = require("express");
const cors = require("cors");
const mongoose = require('mongoose')
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());


const MONGO_URI = 'mongodb+srv://cvasiva6300:jciyQyhji38qJHY0@cluster0.cztxufe.mongodb.net/?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ DB connected...'))
    .catch(err => console.log('❌ DB connection error:', err));

const accountSid = process.env.TWILIO_SID;
const authToken = "270490b146f66b914f7e352708a36185";
const twilioClient = twilio(accountSid, authToken);
const twilioPhoneNumber = "+19109811495";

const JWT_SECRET = "7a339f21724ee8af0be35ecfce6b728ab59475e082013c5c25d10b66543dcaf8"

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    otp: String,
    otpExpires: Date,
    verified: { type: Boolean, default: false }
});

const User = mongoose.model("User", UserSchema);

// Generate & Send OTP using Twilio
app.post("/send-otp", async (req, res) => {
    let { name, phone } = req.body;
    if (!name || !phone) {
        return res.status(400).json({ message: "Name and phone number are required" });
    }

    // Ensure phone number is in correct format (add +91 if missing)
    if (!phone.startsWith("+91")) {
        phone = `+91${phone}`;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 5 * 60 * 1000;

    await User.findOneAndUpdate(
        { phone },
        { name, otp, otpExpires, verified: false },
        { upsert: true, new: true }
    );

    try {
        await twilioClient.messages.create({
            body: `Your OTP is: ${otp}`,
            from: twilioPhoneNumber,
            to: phone
        });

        res.json({ message: "OTP sent successfully!" });
    } catch (error) {
        console.error("Twilio Error:", error);
        res.status(500).json({ message: "Failed to send OTP. Try again later." });
    }
});

app.post("/verify-otp", async (req, res) => {
    let { phone, otp } = req.body;

    if (!phone.startsWith("+91")) {
        phone = `+91${phone}`;
    }

    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.otp !== otp || user.otpExpires < Date.now()) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.verified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    const token = jwt.sign({ userId: user._id, phone: user.phone }, JWT_SECRET, { expiresIn: "1h" });

    res.json({
        message: "OTP verified successfully!",
        token,
        user: { name: user.name, phone: user.phone, verified: true }
    });
});


// Protected Route (Example)
app.get("/protected", (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "Access denied" });

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        res.json({ message: "Access granted", user: verified });
    } catch (error) {
        res.status(401).json({ message: "Invalid token" });
    }
});

let blacklistedTokens = [];

app.post("/logout", (req, res) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(400).json({ message: "No token provided" });
    }

    blacklistedTokens.push(token);
    res.json({ message: "Logged out successfully" });
});


app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
