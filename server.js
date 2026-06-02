import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory session store (mapping token -> cookie jar)
const sessions = {};

function generateToken() {
  return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

// 1. LOGIN TO HAC AND FETCH STUDENT LIST
app.post('/api/login', async (req, res) => {
  const { districtUrl, username, password } = req.body;
  if (!districtUrl || !username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  const baseUrl = districtUrl.endsWith('/') ? districtUrl.slice(0, -1) : districtUrl;
  
  try {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar }));

    // Step 1: Get the login page to extract the anti-forgery token
    const loginPageRes = await client.get(`${baseUrl}/Account/LogOn`);
    const $ = cheerio.load(loginPageRes.data);
    const token = $('input[name="__RequestVerificationToken"]').val();

    // Step 2: Perform the POST login
    const loginParams = new URLSearchParams();
    
    // Automatically extract all default fields from the login form to prevent ASP.NET 500 Model Binding Errors
    $('input').each((i, el) => {
      const name = $(el).attr('name');
      const val = $(el).attr('value');
      if (name && val !== undefined && name !== 'LogOnDetails.UserName' && name !== 'LogOnDetails.Password') {
        loginParams.append(name, val);
      }
    });

    let dbVal = $('select[name="Database"] option').first().attr('value');
    if (dbVal) loginParams.set('Database', dbVal);
    if (!loginParams.has('Database')) loginParams.set('Database', '10');

    loginParams.set('LogOnDetails.UserName', username);
    loginParams.set('LogOnDetails.Password', password);

    const authRes = await client.post(`${baseUrl}/Account/LogOn`, loginParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${baseUrl}/Account/LogOn`
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });

    if (authRes.data && authRes.data.includes('validation-summary-errors')) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    // Step 3: Fetch the Student Picker directly to get the list of active students for the parent
    const retUrl = encodeURIComponent('/HomeAccess/Classes/Classwork');
    const pickerRes = await client.get(`${baseUrl}/Frame/StudentPicker?url=${retUrl}`);
    
    // Save live HTML of the picker page for diagnostics
    fs.writeFileSync('picker_get.html', pickerRes.data);
    console.log(`[login] Saved picker page HTML to picker_get.html. Response status: ${pickerRes.status}`);

    const $picker = cheerio.load(pickerRes.data);
    
    const students = [];
    $picker('.sg-student-picker-row').each((i, el) => {
        const id = $picker(el).find('input[type="radio"]').attr('value');
        const name = $picker(el).find('.sg-picker-student-name').text().trim();
        const gradeDesc = $picker(el).find('.sg-picker-grade').text().trim();
        if (id && name) {
           students.push({ id, name, grade: gradeDesc });
        }
    });
    console.log(`[login] Parsed ${students.length} students from the picker page:`, students);

    const switchParams = {};
    let studentInputName = 'studentId';
    $picker('form').first().find('input[type="hidden"]').each((i, el) => {
        const name = $picker(el).attr('name');
        const val = $picker(el).attr('value');
        if (name && val !== undefined && !switchParams[name]) {
            switchParams[name] = val;
        }
    });
    
    $picker('input[type="radio"]').each((i, el) => {
        if ($picker(el).attr('name')) studentInputName = $picker(el).attr('name');
    });

    let formAction = $picker('form').first().attr('action') || `/HomeAccess/Frame/StudentPicker`;
    const postUrlObj = new URL(formAction, baseUrl + '/');
    const postUrl = postUrlObj.href;

    // Login successful - create a session mapped to this data
    const sessionToken = generateToken();
    sessions[sessionToken] = { client, baseUrl, students, switchParams, postUrl, studentInputName, retUrl };

    return res.json({ success: true, token: sessionToken, students });

  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to connect to school district servers' });
  }
});

// Endpoint to explicitly SELECT a student from the list
app.post('/api/selectStudent', async (req, res) => {
    const { token, studentId } = req.body;
    const session = sessions[token];
    if (!session) return res.status(401).json({ error: 'Unauthorized or Expired Session' });

    console.log(`[selectStudent] Selecting studentId: ${studentId} for token: ${token}`);
    console.log(`[selectStudent] postUrl: ${session.postUrl}`);
    console.log(`[selectStudent] studentInputName: ${session.studentInputName}`);

    try {
       const params = new URLSearchParams();
       for (const [k, v] of Object.entries(session.switchParams)) {
           params.set(k, v);
       }
       
       params.set(session.studentInputName, studentId);
       params.set('studentId', studentId);
       
       if (!params.get('url')) {
          params.set('url', '/HomeAccess/Classes/Classwork');
       }

       console.log(`[selectStudent] params:`, Object.fromEntries(params));

       const switchRes = await session.client.post(session.postUrl, params, {
           headers: { 
               'Content-Type': 'application/x-www-form-urlencoded', 
               'Referer': `${session.baseUrl}/Frame/StudentPicker?url=${session.retUrl}` 
           },
           maxRedirects: 0,
           validateStatus: s => s < 500
       });
       
       console.log(`[selectStudent] Response Status: ${switchRes.status}`);
       console.log(`[selectStudent] Redirect Location: ${switchRes.headers.location}`);

       // Save response HTML to a file to debug if it returned an error
       fs.writeFileSync('picker_switch.html', switchRes.data);

       if (switchRes.status >= 300 && switchRes.status < 400 && switchRes.headers.location && switchRes.headers.location.includes('Error')) {
           console.warn(`[selectStudent] Warning: Redirected to error page: ${switchRes.headers.location}`);
       }
       
       const selectedStudent = session.students.find(s => s.id === studentId);
       session.studentName = selectedStudent ? selectedStudent.name : 'Student';

       res.json({ success: true, studentName: session.studentName });
    } catch(err) {
       console.error("Student Selection Error", err.stack || err.message);
       res.status(500).json({ error: "Failed to switch active context to the requested student." });
    }
});


// 2. GET GRADES (Using active session context)
app.get('/api/grades', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const session = sessions[token];

  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let gradesRes = await session.client.get(`${session.baseUrl}/Grades/IPR`);
    let $ = cheerio.load(gradesRes.data);
    
    // Check if the actual IPR data is inside an older WebForms iframe
    let iframeSrc = $('#sg-legacy-iframe').attr('src');
    if (iframeSrc) {
       const fetchUrl = iframeSrc.startsWith('http') ? iframeSrc : `${session.baseUrl}${iframeSrc.replace('/HomeAccess', '')}`;
       gradesRes = await session.client.get(fetchUrl);
       $ = cheerio.load(gradesRes.data);
    }
    
    const classes = [];
    
    // Parse the IPR grid table
    $('table.sg-asp-table tr.sg-asp-table-data-row').each((i, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 6) {
           const courseId = $(cols[0]).text().trim();
           const desc = $(cols[1]).text().trim();
           const period = $(cols[2]).text().trim();
           const teacher = $(cols[3]).text().trim();
           
           let currentGradeStr = '';
           for (let j = 5; j < cols.length; j++) {
              const val = $(cols[j]).text().trim();
              if (val && !isNaN(parseFloat(val))) {
                 currentGradeStr = val;
                 break;
              }
           }
           
           let grade = 0;
           let letter = '-';
           if (currentGradeStr) {
              grade = parseFloat(currentGradeStr);
              letter = grade >= 89.5 ? 'A' : grade >= 79.5 ? 'B' : grade >= 69.5 ? 'C' : grade >= 59.5 ? 'D' : 'F';
           }
           
           if (desc || courseId) {
             classes.push({
                id: `course_${courseId.replace(/\s+/g, '')}_${i}`,
                name: desc || courseId,
                grade: grade,
                letter: letter,
                instructor: teacher,
                period: period,
                lastUpdated: 'Live from IPR'
             });
           }
        }
    });

    if (classes.length === 0) {
      console.warn("IPR table was empty, attempting to parse Report Card...");
      let rcRes = await session.client.get(`${session.baseUrl}/Grades/ReportCard`);
      let $rc = cheerio.load(rcRes.data);
      let rcIframeSrc = $rc('#sg-legacy-iframe').attr('src');
      if (rcIframeSrc) {
         const fetchUrl = rcIframeSrc.startsWith('http') ? rcIframeSrc : `${session.baseUrl}${rcIframeSrc.replace('/HomeAccess', '')}`;
         rcRes = await session.client.get(fetchUrl);
         $rc = cheerio.load(rcRes.data);
      }
      fs.writeFileSync('reportcard.html', rcRes.data);
      
      $rc('table.sg-asp-table tr.sg-asp-table-data-row').each((i, row) => {
         const cols = $rc(row).find('td');
         if (cols.length >= 5) {
             const desc = $rc(cols[1]).text().trim();
             const teacher = $rc(cols[3]).text().trim();
             let grade = 0;
             for (let j = 4; j < cols.length; j++) {
                const val = $rc(cols[j]).text().trim();
                if (val && !isNaN(parseFloat(val))) grade = parseFloat(val);
             }
             if (desc) {
                classes.push({
                  id: `rc_${i}`,
                  name: desc,
                  grade: grade,
                  letter: grade >= 89.5 ? 'A' : grade >= 79.5 ? 'B' : grade >= 69.5 ? 'C' : 'F',
                  instructor: teacher,
                  lastUpdated: 'Report Card'
               });
             }
         }
      });
    }

    res.json({ success: true, classes });

  } catch (error) {
    console.error('Grades error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to scrape classes from HAC' });
  }
});

// 3. GET CLASS ASSIGNMENTS
app.get('/api/class/:id', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const session = sessions[token];
  
  if (!session) {
    return res.json({ success: true, assignments: [] });
  }

  try {
    const classworkRes = await session.client.get(`${session.baseUrl}/Classes/Classwork`);
    const $ = cheerio.load(classworkRes.data);
    
    const courseIndex = parseInt(req.params.id.split('_').pop()) || 0;
    const courseElem = $('.AssignmentClass').eq(courseIndex);
    
    const assignments = [];
    
    courseElem.find('table.sg-asp-table tr.sg-asp-table-data-row').each((i, row) => {
       const tds = $(row).find('td');
       if (tds.length >= 5) {
         const title = $(tds[2]).text().trim().replace(/\*/g, '');
         const category = $(tds[3]).text().trim();
         const scoreStr = $(tds[5]).text().trim();
         
         let grade = parseFloat(scoreStr);
         if (isNaN(grade)) grade = 100;

         assignments.push({
           title,
           category,
           grade,
           max: 100,
           weight: category.toLowerCase().includes('major') ? 60 : 40
         });
       }
    });

    res.json({ success: true, assignments });
  } catch(error) {
     res.status(500).json({ success: false, error: 'Failed' });
  }
});

  // GET SCHEDULE
  // -----------------------------------------
  app.get('/api/schedule', async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions[token];
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const schedRes = await session.client.get(`${session.baseUrl}/Classes/Schedule`);
      fs.writeFileSync('schedule.html', schedRes.data);
      const $ = cheerio.load(schedRes.data);
      
      const schedule = [];
      $('table.sg-asp-table tr.sg-asp-table-data-row').each((i, row) => {
         const cols = $(row).find('td');
         if (cols.length >= 6) {
            schedule.push({
               course: $(cols[0]).text().trim(),
               description: $(cols[1]).text().trim(),
               period: $(cols[2]).text().trim(),
               teacher: $(cols[3]).text().trim(),
               room: $(cols[4]).text().trim(),
               days: $(cols[5]).text().trim()
            });
         }
      });

      res.json({ success: true, schedule });
    } catch (error) {
      console.error('Schedule scrape failed:', error.message);
      res.status(500).json({ success: false, error: 'Failed to scrape schedule from HAC' });
    }
  });

  // -----------------------------------------
  // GET ATTENDANCE
  // -----------------------------------------
  app.get('/api/attendance', async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions[token];
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const attRes = await session.client.get(`${session.baseUrl}/Attendance`);
      fs.writeFileSync('attendance.html', attRes.data);
      const $ = cheerio.load(attRes.data);
      
      const events = [];
      
      // Usually, HAC attendance events are shown inside a calendar grid with class '.sg-attend-event' or '.sg-content-grid'
      // Best effort parsing for general absences
      $('.sg-attend-day').each((i, el) => {
          const title = $(el).attr('title'); // e.g., '10/12/2026: Absent'
          if (title && (title.toLowerCase().includes('absent') || title.toLowerCase().includes('tard'))) {
             events.push({
               date: title.split(':')[0] || 'Unknown Date',
               reason: title.split(':')[1] || title
             });
          }
      });

      // Alternatively, try the list view table
      if (events.length === 0) {
          $('table.sg-asp-table tr.sg-asp-table-data-row').each((i, row) => {
             const cols = $(row).find('td');
             if (cols.length >= 3) {
                events.push({
                   date: $(cols[0]).text().trim(),
                   reason: $(cols[2]).text().trim() || $(cols[1]).text().trim()
                });
             }
          });
      }
      
      res.json({ success: true, events });
    } catch (error) {
      console.error('Attendance scrape failed:', error.message);
      res.status(500).json({ success: false, error: 'Failed' });
    }
  });

  // -----------------------------------------
  // GET TRANSCRIPT (Now using Report Card FINAL column as requested)
  // -----------------------------------------
  app.get('/api/transcript', async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions[token];
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    try {
      console.log(`[reportcard] Fetching Report Card for token: ${token}`);
      let rcRes = await session.client.get(`${session.baseUrl}/Grades/ReportCard`);
      let $ = cheerio.load(rcRes.data);
      
      // Check if the actual report card data is inside an older WebForms iframe
      let iframeSrc = $('#sg-legacy-iframe').attr('src');
      if (iframeSrc) {
         console.log(`[reportcard] Found legacy iframe: ${iframeSrc}`);
         const fetchUrl = iframeSrc.startsWith('http') ? iframeSrc : `${session.baseUrl}${iframeSrc.replace('/HomeAccess', '')}`;
         rcRes = await session.client.get(fetchUrl);
         $ = cheerio.load(rcRes.data);
      }
      
      // Save raw report card HTML for diagnostics
      fs.writeFileSync('reportcard.html', rcRes.data);
      console.log(`[reportcard] Saved raw HTML to reportcard.html`);

      const classes = [];
      
      // 1. Locate the report card table headers to map indices dynamically
      const headers = [];
      $('table.sg-asp-table tr.sg-asp-table-header-row td').each((i, el) => {
         headers.push($(el).text().trim().toLowerCase());
      });
      
      console.log(`[reportcard] Detected table headers:`, headers);
      
      let courseIdx = headers.findIndex(h => h.includes('course'));
      let descIdx = headers.findIndex(h => h.includes('desc') || h.includes('description'));
      let creditIdx = headers.findIndex(h => h.includes('att') && h.includes('credit'));
      let finalIdx = headers.findIndex(h => h === 'fin' || h === 'final');

      // Robust fallbacks if headers couldn't be parsed
      if (courseIdx === -1) courseIdx = 0;
      if (descIdx === -1) descIdx = 1;
      if (creditIdx === -1) creditIdx = 5;
      if (finalIdx === -1) {
         // High school typically has 24 columns, with FINAL at column index 15
         // Middle school has 16 columns, with FIN at column index 13
         finalIdx = headers.length >= 20 ? 15 : 13;
      }
      
      console.log(`[reportcard] Using column indices -> Course: ${courseIdx}, Desc: ${descIdx}, Credit: ${creditIdx}, Final: ${finalIdx}`);

      // 2. Iterate over the data rows to extract course grades
      $('table.sg-asp-table tr.sg-asp-table-data-row').each((rowIdx, rowEl) => {
         const cols = $(rowEl).find('td');
         if (cols.length > Math.max(courseIdx, descIdx, finalIdx)) {
            const courseId = $(cols[courseIdx]).text().trim();
            const description = $(cols[descIdx]).text().trim();
            const finalGradeStr = $(cols[finalIdx]).text().trim();
            
            let credit = 0.5;
            if (creditIdx !== -1 && cols.length > creditIdx) {
               const creditStr = $(cols[creditIdx]).text().trim();
               credit = parseFloat(creditStr) || 0.5;
            }

            // Skip invalid or header-like rows
            if (!courseId && !description) return;
            if (courseId.toLowerCase().includes('course') || description.toLowerCase().includes('description')) return;

            // Only extract courses with a numeric FINAL grade (representing completed courses)
            if (finalGradeStr && !isNaN(parseFloat(finalGradeStr))) {
               const grade = parseFloat(finalGradeStr);
               const letter = grade >= 89.5 ? 'A' : grade >= 79.5 ? 'B' : grade >= 69.5 ? 'C' : grade >= 59.5 ? 'D' : 'F';
               
               classes.push({
                  id: `rc_${courseId.replace(/\s+/g, '')}_${rowIdx}`,
                  name: description || courseId,
                  grade: grade,
                  letter: letter,
                  instructor: 'Report Card Record',
                  period: 'N/A',
                  credit: credit
               });
            }
         }
      });

      console.log(`[reportcard] Parsed ${classes.length} classes with valid FINAL scores:`, classes);
      res.json({ success: true, classes });

    } catch (error) {
      console.error('Report Card scrape failed:', error.message);
      res.status(500).json({ success: false, error: 'Failed to scrape report card from HAC' });
    }
  });

app.listen(PORT, () => {
  console.log(`HAC Scraper Proxy Server running on port ${PORT}`);
});
