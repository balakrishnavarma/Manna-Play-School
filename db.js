require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

let rawSupabase;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    rawSupabase = createClient(supabaseUrl, supabaseKey);
  } else {
    console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY is missing from environment variables!");
  }
} catch (err) {
  console.error("Failed to initialize Supabase client:", err);
}

const supabase = new Proxy({}, {
  get(target, prop) {
    if (!rawSupabase) {
      throw new Error("Supabase client is not initialized. Please ensure SUPABASE_URL and SUPABASE_KEY environment variables are set in your Vercel Dashboard project settings.");
    }
    return rawSupabase[prop];
  }
});

// Seed admin user in Supabase if it doesn't exist
async function seedDb() {
  if (!rawSupabase) {
    console.warn("WARNING: Supabase client is not ready. Skipping database seeding.");
    return;
  }
  const adminEmail = 'admin@mannaplayschool.com';

  try {
    const { data: adminUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', adminEmail)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking for admin user in Supabase:', checkError);
      return;
    }

    if (!adminUser) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('adminpassword', salt);

      const newAdmin = {
        id: 'admin-' + Date.now(),
        name: 'Bala Krishna Varma',
        email: adminEmail,
        passwordHash: passwordHash,
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from('users')
        .insert([newAdmin]);

      if (insertError) {
        console.error('Error seeding admin user in Supabase:', insertError);
      } else {
        console.log('Seeded Supabase database with default admin user: admin@mannaplayschool.com / adminpassword');
      }
    }
  } catch (err) {
    console.error('Seeding process encountered an exception:', err);
  }
}

// Call seed when module loaded
seedDb().catch(err => console.error('Database seeding failed:', err));

module.exports = {
  // User operations
  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    if (error) throw error;
    return data;
  },

  async findUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async addUser(user) {
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(user.password, salt);

    const newUser = {
      id: 'user-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: user.name,
      email: user.email,
      passwordHash: passwordHash,
      role: user.role || 'parent',
      createdAt: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('users')
      .insert([newUser])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateUserPassword(email, newPassword) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const { data, error } = await supabase
      .from('users')
      .update({ passwordHash: passwordHash })
      .ilike('email', email)
      .select();

    if (error) throw error;
    return data && data.length > 0;
  },

  async getApplications() {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .order('createdAt', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getApplicationsByUserId(userId) {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false });
    if (error) throw error;
    return data;
  },

  async addApplication(app) {
    const newApp = {
      ...app,
      id: 'app-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('applications')
      .insert([newApp])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateApplicationStatus(id, status) {
    const { data, error } = await supabase
      .from('applications')
      .update({ status: status })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Contact operations
  async getContacts() {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('createdAt', { ascending: false });
    if (error) throw error;
    return data;
  },

  async addContact(contact) {
    const newContact = {
      ...contact,
      id: 'contact-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      createdAt: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('contacts')
      .insert([newContact])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async uploadStudentPhoto(base64Data, filename) {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid Base64 image format');
    }

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filePath = `photos/${Date.now()}-${filename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('student-photos')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from('student-photos')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }
};
