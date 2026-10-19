import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Shared Gemini Client (User-Agent header set to 'aistudio-build')
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // API endpoint for AI generation of matrix, specification, and test paper
  app.post('/api/gemini/generate-exam', async (req, res) => {
    try {
      const {
        grade,
        subject,
        term,
        textbook,
        examTime,
        mcqRatio,
        rubricConfig,
        level1Percent,
        level2Percent,
        level3Percent,
        customRequirements,
        readingPassage,
        actionType, // 'full_package' | 'matrix_only' | 'spec_only' | 'exam_only' | 'audit_exam' | 'replace_question'
        currentData,
      } = req.body;

      let prompt = '';

      if (actionType === 'replace_question') {
        const { questionToReplace, targetLevel, targetTopic, questionType, maxScore } = req.body;
        prompt = `Bạn là Chuyên gia Khảo thí và Giáo viên Tiểu học hàng đầu Việt Nam, am hiểu sâu sắc Chương trình GDPT 2018 và Thông tư 27/2020/TT-BGDĐT.
Hãy tạo 01 câu hỏi THAY THẾ chất lượng cao cho đề thi:
- Môn: ${subject}, Khối: ${grade}
- Mạch kiến thức/Chủ đề: ${targetTopic || 'Kiến thức trọng tâm'}
- Mức độ: ${targetLevel} (theo Thông tư 27: Mức 1 - Nhận biết / Mức 2 - Kết nối thông hiểu / Mức 3 - Vận dụng)
- Hình thức: ${questionType || 'Trắc nghiệm khách quan 4 lựa chọn A, B, C, D hoặc Tự luận'}
- Điểm số: ${maxScore || 1.0} điểm
- Câu cần thay thế: "${questionToReplace?.content || ''}"

Yêu cầu:
- Câu hỏi phù hợp lứa tuổi học sinh tiểu học, ngôn từ trong sáng, rõ ràng, sư phạm.
- Trả về kết quả JSON với cấu trúc:
{
  "question": {
    "type": "${questionType === 'TL' ? 'TL' : 'TNKQ'}",
    "level": "${targetLevel}",
    "topic": "${targetTopic || 'Kiến thức trọng tâm'}",
    "content": "Nội dung câu hỏi mới...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."], // nếu là trắc nghiệm
    "answer": "A", // đáp án đúng nếu trắc nghiệm
    "score": ${maxScore || 1.0},
    "guide": "Hướng dẫn chấm hoặc giải thích chi tiết..."
  }
}
Chỉ trả về JSON hợp lệ, không bọc markdown thừa ngoài JSON.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        });

        const data = JSON.parse(response.text || '{}');
        return res.json({ success: true, data });
      }

      if (actionType === 'audit_exam') {
        prompt = `Bạn là Chuyên viên Thanh tra Khảo thí và Chuyên gia Đánh giá học sinh tiểu học theo Thông tư 27/2020/TT-BGDĐT và Chương trình GDPT 2018.
Hãy thực hiện THẨM ĐỊNH TOÀN DIỆN bộ Ma trận, Đặc tả và Đề kiểm tra sau đây:
Môn: ${subject}, Lớp: ${grade}, Học kì: ${term}, Bộ sách: ${textbook}
Dữ liệu đề thi:
${JSON.stringify(currentData, null, 2)}

Hãy phân tích và trả về JSON:
{
  "totalScore": 10,
  "assessment": {
    "overallRating": "Tốt" | "Khá" | "Cần điều chỉnh",
    "score": 95, // trên thang 100
    "summary": "Nhận xét tổng quan sư phạm...",
    "criteria": [
      { "name": "Đúng chuẩn kiến thức, kĩ năng GDPT 2018", "status": "pass" | "warning" | "fail", "comment": "..." },
      { "name": "Tỉ lệ 3 mức độ nhận thức (Mức 1, 2, 3 Thông tư 27)", "status": "pass" | "warning" | "fail", "comment": "..." },
      { "name": "Tính cân đối Trắc nghiệm và Tự luận", "status": "pass" | "warning" | "fail", "comment": "..." },
      { "name": "Độ chính xác khoa học và ngôn ngữ sư phạm tiểu học", "status": "pass" | "warning" | "fail", "comment": "..." },
      { "name": "Khớp nối giữa Ma trận - Đặc tả - Đề thi - Đáp án", "status": "pass" | "warning" | "fail", "comment": "..." }
    ],
    "recommendations": [
      "Gợi ý hoàn thiện 1...",
      "Gợi ý hoàn thiện 2..."
    ]
  }
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        });

        const data = JSON.parse(response.text || '{}');
        return res.json({ success: true, data });
      }

      // Default: Full Package Generator (Ma trận + Bảng đặc tả + Đề kiểm tra + Đáp án hướng dẫn chấm)
      const systemInstruction = `Bạn là Giáo viên Tiểu học cốt cán, Chuyên gia xây dựng Ma trận, Bản đặc tả và Đề kiểm tra định kì cấp Tiểu học theo đúng quy định của Bộ Giáo dục và Đào tạo Việt Nam:
1. Thông tư số 27/2020/TT-BGDĐT ngày 04/9/2020 ban hành Quy định đánh giá học sinh tiểu học (3 Mức độ đánh giá: Mức 1 - Nhận biết; Mức 2 - Kết nối, thông hiểu; Mức 3 - Vận dụng).
2. Chương trình Giáo dục phổ thông 2018 (Chương trình tổng thể và chương trình môn học).
3. Đảm bảo tính khoa học, chuẩn xác, ngôn từ chuẩn mực sư phạm, phù hợp với tâm lý lứa tuổi học sinh tiểu học.
4. Tổng điểm toàn bài luôn luôn là 10.0 điểm.
5. Sự liên kết và đồng bộ 100% giữa Ma trận đề - Bản đặc tả - Đề kiểm tra - Hướng dẫn chấm.`;

      prompt = `Hãy xây dựng BỘ HỒ SƠ ĐỀ KIỂM TRA ĐỊNH KÌ TOÀN DIỆN bao gồm:
1. KHUNG MA TRẬN ĐỀ KIỂM TRA (Matrix) theo chuẩn Thông tư 27/2020/TT-BGDĐT.
2. BẢN ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA (Test Specification).
3. ĐỀ KIỂM TRA HỌC SINH (Student Exam Paper) hoàn chỉnh, đẹp, rõ ràng.
4. ĐÁP ÁN VÀ BIỂU ĐIỂM HƯỚNG DẪN CHẤM CHI TIẾT (Rubric & Scoring Guide).

THÔNG TIN ĐỀ BÀI:
- Cấp học: Tiểu học
- Khối lớp: ${grade} (Lớp 1, 2, 3, 4 hoặc 5)
- Môn học: ${subject}
- Thời điểm kiểm tra: ${term} (VD: Giữa Học kì 1, Cuối Học kì 1, Giữa Học kì 2, Cuối Học kì 2)
- Bộ sách giáo khoa tham chiếu: ${textbook}
- Thời gian làm bài: ${examTime || 40} phút
- Tỉ lệ hình thức: Trắc nghiệm khách quan (TNKQ) ${mcqRatio || 50}% - Tự luận (TL) ${100 - (mcqRatio || 50)}%
- Định hướng phân bổ mức độ nhận thức theo Thông tư 27:
  + Mức 1 (Nhận biết): khoảng ${level1Percent || 40}% (tầm ${((level1Percent || 40) / 10).toFixed(1)} điểm)
  + Mức 2 (Kết nối/Thông hiểu): khoảng ${level2Percent || 30}% (tầm ${((level2Percent || 30) / 10).toFixed(1)} điểm)
  + Mức 3 (Vận dụng): khoảng ${level3Percent || 30}% (tầm ${((level3Percent || 30) / 10).toFixed(1)} điểm)
- Yêu cầu đặc biệt từ giáo viên: ${customRequirements || 'Bám sát nội dung trọng tâm giai đoạn này, có câu hỏi liên hệ thực tế gần gũi với học sinh.'}
${readingPassage ? `- Ngữ liệu đọc hiểu / Văn bản đọc được cung cấp bởi giáo viên:\n"""\n${readingPassage}\n"""` : ''}

QUY ĐỊNH CẤU TRÚC KẾT QUẢ ĐẦU RA (JSON FORMAT):
Hãy trả về ĐÚNG MỘT ĐỐI TƯỢNG JSON với các trường sau:

{
  "meta": {
    "schoolHeader": "PHÒNG GIÁO DỤC VÀ ĐÀO TẠO...",
    "subHeader": "TRƯỜNG TIỂU HỌC...",
    "examTitle": "BÀI KIỂM TRA ĐỊNH KÌ ...",
    "grade": "${grade}",
    "subject": "${subject}",
    "textbook": "${textbook}",
    "term": "${term}",
    "academicYear": "2025 - 2026",
    "duration": "${examTime || 40} phút"
  },
  "matrix": {
    "columns": ["Mạch kiến thức, kĩ năng", "Mức 1 (TNKQ)", "Mức 1 (TL)", "Mức 2 (TNKQ)", "Mức 2 (TL)", "Mức 3 (TNKQ)", "Mức 3 (TL)", "Tổng số câu", "Tổng điểm", "Tỉ lệ %"],
    "rows": [
      {
        "topic": "Tên mạch kiến thức 1",
        "level1_tnkq": 2, "level1_tnkq_score": 1.0,
        "level1_tl": 0, "level1_tl_score": 0,
        "level2_tnkq": 1, "level2_tnkq_score": 1.0,
        "level2_tl": 1, "level2_tl_score": 1.0,
        "level3_tnkq": 0, "level3_tnkq_score": 0,
        "level3_tl": 1, "level3_tl_score": 1.0,
        "totalQuestions": 5,
        "totalScore": 4.0,
        "percentage": 40
      }
    ],
    "summary": {
      "level1TotalScore": 4.0, "level1Percentage": 40,
      "level2TotalScore": 3.0, "level2Percentage": 30,
      "level3TotalScore": 3.0, "level3Percentage": 30,
      "tnkqTotalScore": 5.0, "tnkqPercentage": 50,
      "tlTotalScore": 5.0, "tlPercentage": 50,
      "grandTotalScore": 10.0
    }
  },
  "specification": [
    {
      "order": 1,
      "topic": "Tên chủ đề / Mạch nội dung",
      "requiredCompetencies": "Yêu cầu cần đạt chuẩn GDPT 2018 chi tiết...",
      "questionNumber": "Câu 1",
      "level": "Mức 1",
      "format": "TNKQ",
      "score": 0.5
    }
  ],
  "exam": {
    "studentInfoSection": {
      "hasName": true,
      "hasClass": true,
      "hasScoreTable": true,
      "hasTeacherRemarks": true
    },
    "readingPassage": {
      "title": "Tên bài đọc (nếu là Tiếng Việt Đọc hiểu)",
      "author": "Tên tác giả",
      "content": "Nội dung bài đọc phù hợp độ dài lứa tuổi tiểu học..."
    },
    "parts": [
      {
        "partId": "part_1",
        "title": "PHẦN I. TRẮC NGHIỆM",
        "instructions": "Khoanh tròn vào chữ cái đặt trước câu trả lời đúng hoặc thực hiện theo yêu cầu:",
        "questions": [
          {
            "id": "q1",
            "questionNumber": "Câu 1",
            "level": "Mức 1",
            "score": 0.5,
            "type": "multiple_choice", // multiple_choice | matching | fill_in | true_false
            "content": "Nội dung câu hỏi...",
            "options": ["A. Lựa chọn 1", "B. Lựa chọn 2", "C. Lựa chọn 3", "D. Lựa chọn 4"],
            "correctAnswer": "A",
            "guide": "Giải thích ngắn vì sao chọn A"
          }
        ]
      },
      {
        "partId": "part_2",
        "title": "PHẦN II. TỰ LUẬN",
        "instructions": "Học sinh trình bày bài làm chi tiết:",
        "questions": [
          {
            "id": "q_tl1",
            "questionNumber": "Câu ...",
            "level": "Mức 2",
            "score": 1.5,
            "type": "essay",
            "content": "Nội dung bài toán hoặc bài viết...",
            "solutionSteps": [
              { "step": "Bước giải 1 / Ý 1", "subScore": 0.5, "detail": "Chi tiết lời giải..." },
              { "step": "Bước giải 2 / Đáp số", "subScore": 1.0, "detail": "Chi tiết..." }
            ],
            "guide": "Lưu ý sư phạm khi chấm..."
          }
        ]
      }
    ]
  },
  "answerKey": {
    "tnkqAnswers": [
      { "questionNumber": "Câu 1", "answer": "A", "score": 0.5 }
    ],
    "essayAnswers": [
      {
        "questionNumber": "Câu 7",
        "content": "Đáp án và biểu điểm chi tiết",
        "points": [
          { "criterion": "Ý 1 / Phép tính 1", "score": 0.5 },
          { "criterion": "Ý 2 / Đáp số đúng", "score": 0.5 }
        ]
      }
    ],
    "teacherRubricNotes": [
      "Học sinh làm cách khác đúng vẫn cho điểm tối đa.",
      "Đối với môn Tiếng Việt, chữ viết rõ ràng, sạch sẽ, không sai chính tả quá 3 lỗi...",
      "Khuyến khích sự sáng tạo và diễn đạt tự nhiên của học sinh."
    ]
  }
}

LƯU Ý QUAN TRỌNG:
- Tổng điểm các câu hỏi trong exam PHẢI ĐÚNG BẰNG 10.0 ĐIỂM.
- Số câu và điểm ở Ma trận, Đặc tả, Đề thi và Hướng dẫn chấm phải HOÀN TOÀN KHỚP NHAU.
- Với Tiếng Việt Tiểu học: Nếu là bài kiểm tra đọc, có phần Đọc thành tiếng (nêu gợi ý văn bản SGK) + Đọc hiểu & Luyện từ và câu. Nếu là kiểm tra viết, có phần Viết chính tả / đoạn văn và Tập làm văn.
- Với Toán Tiểu học: Đầy đủ các mạch Số & phép tính, Hình học & Đo lường, Thống kê xác suất, Bài toán thực tế.
- Với Khoa học / LS&ĐL / Tin học / Công nghệ / Tiếng Anh: Tôn trọng chuẩn kiến thức kĩ năng GDPT 2018.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.6,
        },
      });

      const responseText = response.text || '{}';
      const parsedData = JSON.parse(responseText);

      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (error: any) {
      console.error('Error generating exam with Gemini:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Lỗi xử lý AI khi tạo đề kiểm tra',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', appName: 'APP TẠO ĐỀ MA TRẬN VÀ ĐỀ KIỂM TRA TIỂU HỌC' });
  });

  // In development, hook up Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve dist folder
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
