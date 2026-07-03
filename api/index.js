require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const db = require('../db');

const app = express();
const PORT = process.env.PORT || 3000;

// Memory storage for OTPs (simulating SMS/Email service)
const otpStore = {};

// Express Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session middleware configuration
app.use(session({
  secret: 'manna-playschool-secret-key-987654321',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if running on HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serving static files from 'frontendcode' and 'media'
// Note: On Vercel, this is mostly ignored for static assets because Vercel handles them natively.
// However, it's kept here for local testing.
app.use('/frontendcode', express.static(path.join(__dirname, '../frontendcode')));
app.use('/media', express.static(path.join(__dirname, '../media')));

// Redirect root URL to homepage.html
app.get('/', (req, res) => {
  res.redirect('/frontendcode/homepage.html');
});

// Middleware to protect admin routes
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
}

/* ==================== AUTHENTICATION APIS ==================== */

// POST: Sign Up
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please provide name, email, and password.' });
    }
    
    const existingUser = await db.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }
    
    const newUser = await db.addUser({
      name,
      email,
      password,
      role: 'parent' // Default role is parent
    });
    
    // Log the user in automatically after signup
    req.session.user = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role
    };
    
    res.status(201).json({ success: true, user: req.session.user });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message || 'Failed to create user account.' });
  }
});

// POST: Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password.' });
    }
    
    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    
    const bcrypt = require('bcryptjs');
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    
    // Set session data
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    
    res.json({ success: true, user: req.session.user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'An error occurred during login.' });
  }
});

// POST: Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET: Session status
app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

/* ==================== FORGOT PASSWORD APIS ==================== */

// POST: Send OTP
app.post('/api/forgot-password/send-otp', async (req, res) => {
  const { contact } = req.body;
  if (!contact) {
    return res.status(400).json({ error: 'Please enter your email or phone.' });
  }

  // Find user by email (we'll check users)
  // For phone number simulation, we look if user contains details or just verify
  const user = await db.findUserByEmail(contact);
  if (!user) {
    return res.status(400).json({ error: 'No account found with this email.' });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[contact.toLowerCase()] = {
    otp: otp,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
  };

  console.log(`[SMS/Email Simulation] Sending OTP to ${contact}: ${otp}`);

  // Return OTP in response so they can easily enter it in local test environment
  res.json({ success: true, message: 'OTP sent successfully (Simulated)', otp: otp });
});

// POST: Verify OTP
app.post('/api/forgot-password/verify-otp', (req, res) => {
  const { contact, otp } = req.body;
  if (!contact || !otp) {
    return res.status(400).json({ error: 'Missing contact or OTP.' });
  }

  const record = otpStore[contact.toLowerCase()];
  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this contact.' });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[contact.toLowerCase()];
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  if (record.otp !== otp.toString()) {
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
  }

  // OTP verified, mark verification status in session or temp database
  req.session.verifiedResetEmail = contact.toLowerCase();
  delete otpStore[contact.toLowerCase()]; // Remove OTP once used

  res.json({ success: true, message: 'OTP verified successfully.' });
});

// POST: Reset Password
app.post('/api/forgot-password/reset', async (req, res) => {
  const { password } = req.body;
  const email = req.session.verifiedResetEmail;

  if (!email) {
    return res.status(400).json({ error: 'Session expired or OTP verification incomplete.' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const success = await db.updateUserPassword(email, password);
  if (success) {
    // Clear verification state
    delete req.session.verifiedResetEmail;
    res.json({ success: true, message: 'Password has been reset successfully.' });
  } else {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

/* ==================== PLAY SCHOOL PUBLIC APIS ==================== */

// POST: Submit Admissions Form
app.post('/api/apply', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'You must be logged in to submit an admission form.' });
    }

    // Check if user already has a pending application
    const userApps = await db.getApplicationsByUserId(req.session.user.id);
    const hasPending = userApps.some(a => a.status === 'pending');
    if (hasPending) {
      return res.status(400).json({ error: 'You already have a pending application. You cannot submit another one until it is approved or rejected.' });
    }

    const appData = req.body;
    
    // Validation
    if (!appData.studentName || !appData.dob || !appData.classAdmitted || !appData.studentPhoto || !appData.aadhar || !appData.fatherContact || !appData.motherContact) {
      return res.status(400).json({ error: 'Please fill in all mandatory fields, including the student photo.' });
    }

    // Helper to calculate age in years
    const calculateAge = (dobString) => {
      const today = new Date();
      const birthDate = new Date(dobString);
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    };

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    
    if (appData.dob > todayStr) {
      return res.status(400).json({ error: 'Date of Birth cannot be in the future.' });
    }

    const dobParts = appData.dob.split('-');
    if (dobParts.length === 3) {
      const month = parseInt(dobParts[1], 10);
      const day = parseInt(dobParts[2], 10);
      if (month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid Date of Birth. Month must be between 1 and 12.' });
      }
      if (day < 1 || day > 31) {
        return res.status(400).json({ error: 'Invalid Date of Birth. Day must be between 1 and 31.' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid Date of Birth format.' });
    }

    const age = calculateAge(appData.dob);
    if (appData.classAdmitted === 'Play School' && age < 3) {
      return res.status(400).json({ error: 'Student must be at least 3 years old to enroll in Play School.' });
    }
    if (appData.classAdmitted === 'LKG' && age < 4) {
      return res.status(400).json({ error: 'Student must be at least 4 years old to enroll in LKG.' });
    }
    if (appData.classAdmitted === 'UKG' && age < 5) {
      return res.status(400).json({ error: 'Student must be at least 5 years old to enroll in UKG.' });
    }
    
    // Link application to logged in user
    appData.userId = req.session.user.id;

    // Upload student photo to Supabase storage bucket
    if (appData.studentPhoto && appData.studentPhoto.startsWith('data:image/')) {
      try {
        const filename = `${appData.studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
        const photoUrl = await db.uploadStudentPhoto(appData.studentPhoto, filename);
        appData.studentPhoto = photoUrl;
      } catch (err) {
        console.error('Storage upload failed:', err);
        return res.status(500).json({ error: 'Failed to upload student photo to storage.' });
      }
    }
    
    const newApp = await db.addApplication(appData);
    res.status(201).json({ success: true, application: newApp });
  } catch (error) {
    console.error('Admission submission error:', error);
    res.status(500).json({ error: 'Failed to submit admission form.' });
  }
});

// GET: Get user's submitted applications with status
app.get('/api/my-applications', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
    
    const userApps = await db.getApplicationsByUserId(req.session.user.id);
    res.json({ success: true, applications: userApps });
  } catch (error) {
    console.error('Error fetching user applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications.' });
  }
});

// POST: Submit Contact Message
app.post('/api/contact', async (req, res) => {
  try {
    const contactData = req.body;
    
    // Validation
    if (!contactData.parentName || !contactData.childName || !contactData.email || !contactData.phone || !contactData.message) {
      return res.status(400).json({ error: 'Please fill in all contact fields.' });
    }
    
    const newContact = await db.addContact(contactData);
    res.status(201).json({ success: true, contact: newContact });
  } catch (error) {
    console.error('Contact form submission error:', error);
    res.status(500).json({ error: 'Failed to submit contact message.' });
  }
});

/* ==================== ADMIN SYSTEM APIS (Restricted) ==================== */

// GET: All Admission Applications
app.get('/api/admin/applications', requireAdmin, async (req, res) => {
  try {
    const apps = await db.getApplications();
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve applications.' });
  }
});

// POST: Update Application Status (Approve/Reject)
app.post('/api/admin/applications/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'
    
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status update request.' });
    }
    
    const updated = await db.updateApplicationStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    
    res.json({ success: true, application: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update application status.' });
  }
});

module.exports = app;
