const http = require('http');

// Helper to make API calls using node HTTP module (no dependencies needed!)
function apiCall(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : '';
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body ? JSON.parse(body) : null
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('STARTING BACKEND API VERIFICATION TESTS');
  console.log('==================================================\n');

  let sessionCookie = '';
  const testEmail = `verifyparent-${Date.now()}@test.com`;

  // 1. Sign up parent
  console.log('1. Testing User Sign Up...');
  const signupRes = await apiCall('POST', '/api/signup', {
    name: 'Verification Parent',
    email: testEmail,
    password: 'password123'
  });
  
  if (signupRes.status === 201 && signupRes.body.success) {
    console.log('   ✅ Sign up successful!');
  } else {
    console.log(`   ❌ Sign up failed! Status: ${signupRes.status}, Error: ${JSON.stringify(signupRes.body)}`);
    process.exit(1);
  }

  // Save session cookie for subsequent requests
  if (signupRes.headers['set-cookie']) {
    sessionCookie = signupRes.headers['set-cookie'][0].split(';')[0];
  }

  // 2. Submit admission application
  console.log('\n2. Testing Admission Form Submission...');
  const appRes = await apiCall('POST', '/api/apply', {
    studentName: 'Verification Student',
    dob: '2021-03-10',
    classAdmitted: 'Play School',
    studentPhoto: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    aadhar: '999988887777',
    fatherName: 'Father Name',
    fatherAadhar: '111122223333',
    fatherContact: '9000000001',
    motherName: 'Mother Name',
    motherContact: '9000000002',
    placeOfBirth: 'Vijayawada',
    city: 'Vijayawada',
    district: 'NTR',
    state: 'Andhra Pradesh',
    caste: 'General',
    religion: 'Hindu',
    category: 'General',
    motherTongue: 'Telugu',
    address: '123 Test Street, Murali Nagar, Vijayawada'
  }, { Cookie: sessionCookie });

  if (appRes.status === 201 && appRes.body.success) {
    console.log('   ✅ Admission application submitted!');
    var appId = appRes.body.application.id;
  } else {
    console.log(`   ❌ Admission submission failed! Status: ${appRes.status}, Error: ${JSON.stringify(appRes.body)}`);
    process.exit(1);
  }

  // 3. Submit contact query
  console.log('\n3. Testing Contact Message Submission...');
  const contactRes = await apiCall('POST', '/api/contact', {
    parentName: 'Verification Parent',
    childName: 'Verification Student',
    email: testEmail,
    phone: '9000000001',
    message: 'Hello, this is a verify message.'
  });

  if (contactRes.status === 201 && contactRes.body.success) {
    console.log('   ✅ Contact message submitted!');
  } else {
    console.log(`   ❌ Contact submission failed! Status: ${contactRes.status}`);
    process.exit(1);
  }

  // 3b. Test User fetching their own applications
  console.log('\n3b. Testing User Retrieval of Own Applications...');
  const getMyAppsRes = await apiCall('GET', '/api/my-applications', null, { Cookie: sessionCookie });
  if (getMyAppsRes.status === 200 && getMyAppsRes.body.success) {
    const apps = getMyAppsRes.body.applications;
    const testApp = apps.find(a => a.id === appId);
    if (testApp) {
      console.log(`   ✅ Successfully retrieved parent's own application for: "${testApp.studentName}" with status: "${testApp.status}"`);
    } else {
      console.log('   ❌ Parent application not found in private list!');
      process.exit(1);
    }
  } else {
    console.log(`   ❌ Parent my-applications retrieval failed! Status: ${getMyAppsRes.status}`);
    process.exit(1);
  }

  // 4. Log out parent
  console.log('\n4. Testing Logout...');
  const logoutRes = await apiCall('POST', '/api/logout', null, { Cookie: sessionCookie });
  if (logoutRes.status === 200 && logoutRes.body.success) {
    console.log('   ✅ User logged out successfully!');
  } else {
    console.log(`   ❌ Logout failed! Status: ${logoutRes.status}`);
  }

  // 5. Log in as administrator
  console.log('\n5. Testing Administrator Login...');
  const adminLoginRes = await apiCall('POST', '/api/login', {
    email: 'admin@mannaplayschool.com',
    password: 'adminpassword'
  });

  let adminCookie = '';
  if (adminLoginRes.status === 200 && adminLoginRes.body.success && adminLoginRes.body.user.role === 'admin') {
    console.log('   ✅ Admin login successful!');
    adminCookie = adminLoginRes.headers['set-cookie'][0].split(';')[0];
  } else {
    console.log(`   ❌ Admin login failed! Status: ${adminLoginRes.status}`);
    process.exit(1);
  }

  // 6. Admin retrieve applications
  console.log('\n6. Testing Admin Retrieval of Applications...');
  const getAppsRes = await apiCall('GET', '/api/admin/applications', null, { Cookie: adminCookie });
  if (getAppsRes.status === 200) {
    const apps = getAppsRes.body;
    const testApp = apps.find(a => a.id === appId);
    if (testApp) {
      console.log(`   ✅ Found submitted student application: "${testApp.studentName}" with status: "${testApp.status}"`);
    } else {
      console.log('   ❌ Submitted student application not found in list!');
      process.exit(1);
    }
  } else {
    console.log(`   ❌ Admin retrieval failed! Status: ${getAppsRes.status}`);
    process.exit(1);
  }

  // 7. Admin approve application
  console.log('\n7. Testing Admin Admission Application Approval...');
  const approveRes = await apiCall('POST', `/api/admin/applications/${appId}/status`, { status: 'approved' }, { Cookie: adminCookie });
  if (approveRes.status === 200 && approveRes.body.success) {
    console.log(`   ✅ Application status updated successfully to: "${approveRes.body.application.status}"`);
  } else {
    console.log(`   ❌ Application approval failed! Status: ${approveRes.status}`);
    process.exit(1);
  }

  // 8. Admin retrieve contact messages
  console.log('\n8. Testing Admin Retrieval of Contact Queries...');
  const getContactsRes = await apiCall('GET', '/api/admin/contacts', null, { Cookie: adminCookie });
  if (getContactsRes.status === 200) {
    const queries = getContactsRes.body;
    const testQuery = queries.find(q => q.parentName === 'Verification Parent');
    if (testQuery) {
      console.log(`   ✅ Found submitted contact query from: "${testQuery.parentName}" saying: "${testQuery.message}"`);
    } else {
      console.log('   ❌ Submitted query not found in admin list!');
      process.exit(1);
    }
  } else {
    console.log(`   ❌ Admin contacts retrieval failed! Status: ${getContactsRes.status}`);
    process.exit(1);
  }

  console.log('\n==================================================');
  console.log('✅ ALL BACKEND API TESTS COMPLETED SUCCESSFULLY!');
  console.log('==================================================');
}

runTests().catch(e => {
  console.error('\n❌ Test Run Error:', e);
  process.exit(1);
});
