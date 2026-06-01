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
  // GET TRANSCRIPT (Grade 9 only)
  // -----------------------------------------
  app.get('/api/transcript', async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const session = sessions[token];
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    try {
      console.log(`[transcript] Fetching transcript for token: ${token}`);
      let transcriptRes = await session.client.get(`${session.baseUrl}/Grades/Transcript`);
      let $ = cheerio.load(transcriptRes.data);
      
      // Check if the actual transcript data is inside an older WebForms iframe
      let iframeSrc = $('#sg-legacy-iframe').attr('src');
      if (iframeSrc) {
         console.log(`[transcript] Found legacy iframe: ${iframeSrc}`);
         const fetchUrl = iframeSrc.startsWith('http') ? iframeSrc : `${session.baseUrl}${iframeSrc.replace('/HomeAccess', '')}`;
         transcriptRes = await session.client.get(fetchUrl);
         $ = cheerio.load(transcriptRes.data);
      }
      
      // Save raw transcript HTML for diagnostics
      fs.writeFileSync('transcript.html', transcriptRes.data);
      console.log(`[transcript] Saved raw HTML to transcript.html`);

      const classes = [];
      let targetTable = null;
      let foundGrade9 = false;

      // Strategy 1: Look at the table structure in the screenshot.
      // Search all elements matching tags that typically hold header text
      $('span, td, div, th, label, legend, b, strong, p, h1, h2, h3, h4, h5, h6').each((i, el) => {
         const $el = $(el);
         const text = $el.text().trim();
         
         // Match elements that directly contain "Grade: 09" or "Grade: 9"
         if ($el.children().length < 5 && /Grade:\s*(09|9)\b/i.test(text)) {
            console.log(`[transcript] Found matching header element: <${el.tagName}> with text: "${text}"`);
            
            // Look for the next 'table' element in the DOM
            let $nextTable = $el.nextAll('table').first();
            if ($nextTable.length === 0) {
               // Try looking in parents' siblings
               $el.parents().each((j, p) => {
                  const $pTable = $(p).nextAll('table').first();
                  if ($pTable.length > 0 && $nextTable.length === 0) {
                     $nextTable = $pTable;
                  }
               });
            }
            
            if ($nextTable.length > 0) {
               console.log(`[transcript] Found candidate table for Grade 9`);
               targetTable = $nextTable;
               foundGrade9 = true;
               return false; // Break loop
            }
         }
      });

      // Strategy 2: Scan all tables containing 'Course' and 'Description'
      // and check if their header row or their container text contains "Grade: 09" or "Grade: 9"
      if (!foundGrade9) {
         console.log(`[transcript] Strategy 1 failed, trying Strategy 2...`);
         $('table').each((i, tableEl) => {
            const $table = $(tableEl);
            const tableText = $table.text();
            
            if (tableText.includes('Course') && tableText.includes('Description')) {
               const parentText = $table.parent().text();
               if (/Grade:\s*(09|9)\b/i.test(tableText) || /Grade:\s*(09|9)\b/i.test(parentText)) {
                  console.log(`[transcript] Found table via Strategy 2 matching text or parent text`);
                  targetTable = $table;
                  foundGrade9 = true;
                  return false; // Break loop
               }
            }
         });
      }

      if (targetTable) {
         console.log(`[transcript] Parsing Grade 9 transcript table rows...`);
         targetTable.find('tr').each((rowIdx, rowEl) => {
            const $row = $(rowEl);
            const cols = $row.find('td');
            
            if (cols.length >= 5) {
               const courseId = $(cols[0]).text().trim();
               const description = $(cols[1]).text().trim();
               const sem1 = $(cols[2]).text().trim();
               const sem2 = $(cols[3]).text().trim();
               const finalGrade = $(cols[4]).text().trim();
               
               // Credit is usually in the 5th or 6th cell
               const creditStr = cols.length >= 6 ? $(cols[5]).text().trim() : '';
               const credit = parseFloat(creditStr) || 0.5;

               // Skip the header row itself if it matches 'Course' or has empty courseId/description
               if (courseId.toLowerCase().includes('course') || description.toLowerCase().includes('description') || (!courseId && !description)) {
                  return;
               }

               // Determine representative grade
               let grade = NaN;
               if (finalGrade && !isNaN(parseFloat(finalGrade))) {
                  grade = parseFloat(finalGrade);
               } else {
                  // Fallback to SEM1 or SEM2 or average
                  const s1Val = parseFloat(sem1);
                  const s2Val = parseFloat(sem2);
                  if (!isNaN(s1Val) && !isNaN(s2Val)) {
                     grade = (s1Val + s2Val) / 2;
                  } else if (!isNaN(s1Val)) {
                     grade = s1Val;
                  } else if (!isNaN(s2Val)) {
                     grade = s2Val;
                  }
               }

               // Letter grade calculation
               let letter = '-';
               if (!isNaN(grade)) {
                  letter = grade >= 89.5 ? 'A' : grade >= 79.5 ? 'B' : grade >= 69.5 ? 'C' : grade >= 59.5 ? 'D' : 'F';
               }

               if (description || courseId) {
                  classes.push({
                     id: `t_${courseId.replace(/\s+/g, '')}_${rowIdx}`,
                     name: description || courseId,
                     grade: isNaN(grade) ? 0 : grade,
                     letter: letter,
                     instructor: 'Transcript Record',
                     period: 'N/A',
                     credit: credit
                  });
               }
            }
         });
      } else {
         console.warn(`[transcript] Warning: Could not find Grade 9 transcript table!`);
      }

      console.log(`[transcript] Parsed ${classes.length} Grade 9 classes:`, classes);
      res.json({ success: true, classes });

    } catch (error) {
      console.error('Transcript scrape failed:', error.message);
      res.status(500).json({ success: false, error: 'Failed to scrape transcript from HAC' });
    }
  });

app.listen(PORT, () => {
  console.log(`HAC Scraper Proxy Server running on port ${PORT}`);
});
