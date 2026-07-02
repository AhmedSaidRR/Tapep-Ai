import os
import sys
from fpdf import FPDF
import arabic_reshaper
from bidi.algorithm import get_display

class ArabicPDF(FPDF):
    def header(self):
        # Draw header top bar
        self.set_fill_color(30, 58, 138)  # Deep Navy Blue
        self.rect(0, 0, 210, 8, 'F')
        
        # Header Title
        if self.page_no() > 1:
            self.set_font("Arial", size=9)
            self.set_text_color(128, 128, 128)
            title_text = get_display(arabic_reshaper.reshape("مشروع Tapep AI — المساعد الطبي الذكي المتكامل"))
            self.cell(0, 10, title_text, align="R", new_x="LMARGIN", new_y="NEXT")
            self.ln(5)

    def footer(self):
        # Footer page number
        self.set_y(-15)
        self.set_font("Arial", size=9)
        self.set_text_color(128, 128, 128)
        page_text = get_display(arabic_reshaper.reshape(f"الصفحة {self.page_no()}"))
        self.cell(0, 10, page_text, align="C")

def wrap_and_shape_line(text, max_width_chars=75):
    """
    Splits text into lines respecting word boundaries,
    reshapes Arabic text, and applies bidirectional ordering.
    """
    paragraphs = text.split('\n')
    final_lines = []
    for para in paragraphs:
        if not para.strip():
            final_lines.append("")
            continue
            
        words = para.split(' ')
        current_line = []
        current_len = 0
        for word in words:
            # Estimate character length (handle English and Arabic)
            word_len = len(word)
            if current_len + word_len + 1 > max_width_chars:
                line_str = " ".join(current_line)
                reshaped = arabic_reshaper.reshape(line_str)
                bidi_line = get_display(reshaped)
                final_lines.append(bidi_line)
                current_line = [word]
                current_len = word_len
            else:
                current_line.append(word)
                current_len += word_len + 1
        if current_line:
            line_str = " ".join(current_line)
            reshaped = arabic_reshaper.reshape(line_str)
            bidi_line = get_display(reshaped)
            final_lines.append(bidi_line)
    return final_lines

def create_documentation_pdf():
    pdf = ArabicPDF()
    pdf.add_page()
    pdf.set_margins(15, 20, 15)
    
    # Load Windows Arial font
    font_path = r"C:\Windows\Fonts\arial.ttf"
    if not os.path.exists(font_path):
        print(f"Error: Arial font not found at {font_path}")
        sys.exit(1)
        
    pdf.add_font("Arial", "", font_path)
    pdf.set_font("Arial", size=12)
    
    # ── TITLE SECTION ──
    pdf.set_y(20)
    pdf.set_font("Arial", size=24)
    pdf.set_text_color(30, 58, 138)  # Deep Navy Blue
    title = get_display(arabic_reshaper.reshape("مشروع Tapep AI: المساعد الطبي الذكي"))
    pdf.cell(0, 15, title, align="R", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("Arial", size=16)
    subtitle = get_display(arabic_reshaper.reshape("منصة ويب طبية تفاعلية ثنائية اللغة مدعومة بالذكاء الاصطناعي الوكيل"))
    pdf.cell(0, 10, subtitle, align="R", new_x="LMARGIN", new_y="NEXT")
    
    pdf.ln(5)
    
    # Horizontal line
    pdf.set_draw_color(30, 58, 138)
    pdf.set_line_width(0.8)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(10)
    
    # Documentation text structure
    content = [
        ("وصف عام للمشروع", "H1"),
        ("منصة متطورة لتقديم الاستشارات الطبية الأولية، تحليل صور الأشعة والتقارير، وفحص الأعراض. يتميز المشروع بأنه يعتمد على وكيل ذكي (AI Agent) قادر على اتخاذ قرارات ديناميكية مستقلة؛ فيحدد ذاتياً متى يبحث في الملفات الطبية المرفوعة، متى يتصفح الويب لأحدث الدراسات، ومتى يعتمد على البيانات الشخصية للمستخدم لتقديم إجابة مخصصة بالكامل.", "BODY"),
        
        ("1. الهندسة التقنية للمشروع (Tech Stack)", "H1"),
        ("تم اختيار التقنيات بعناية لضمان تحقيق أعلى مستويات السرعة، الاستقرار، وقابلية التوسع:", "BODY"),
        
        ("أ. الظهر البرمجي (Backend)", "H2"),
        ("• FastAPI (Python): تم اختياره لأنه أسرع إطار عمل ويب لبايثون حالياً. يدعم البرمجة غير المتزامنة (async/await) بالكامل، مما يتيح معالجة آلاف الطلبات بالتوازي (مثل بث الإجابات حرفاً بحرف دون تأخير)، بالإضافة لتوفيره توثيقاً تلقائياً تفاعلياً للـ API.", "BODY"),
        ("• LangGraph & LangChain: الأدوات الأساسية لبناء عقل المساعد الذكي. يسمح LangGraph بصياغة نموذج القرار كـ State Graph للتحكم الصارم في تدفق المحادثة وتجاوز الأخطاء، بينما يسهل LangChain ربط نماذج اللغة (LLMs) بالأدوات الخارجية.", "BODY"),
        ("• Llama 3.3 (70B) عبر Groq (النموذج الأساسي): للاستفادة من السرعة الفائقة لمعالجات Groq في معالجة الاستفسارات المعقدة بنموذج ضخم بأقل زمن استجابة (Latency).", "BODY"),
        ("• Gemini 2.5 Flash من Google (النموذج الاحتياطي والـ Vision):", "BODY"),
        ("   - درع حماية (Fallback): يتحول النظام إليه تلقائياً في حال تجاوز حدود الاستهلاك أو انقطاع خدمة Groq لضمان استمرارية المنصة.", "BODY"),
        ("   - نموذج الرؤية (Vision): يُعتمد عليه كقارئ أساسي للصور الطبية، الروشتات، تقارير التحاليل، وأشعة الـ X-Ray والـ OCT بدقة متناهية.", "BODY"),
        
        ("ب. محرك الـ RAG وقاعدة البيانات (Vector Database)", "H2"),
        ("• Pinecone: قاعدة بيانات سحابية متجهة متخصصة في تخزين وإجراء البحث الشبيه (Vector Search). يتم تقسيم الكتب والملفات الطبية ورفع الـ Embeddings إليها، وعند سؤال المستخدم، يسترجع النظام النصوص الأكثر صلة ويزود الـ AI بها لتقديم ردود علمية موثقة.", "BODY"),
        
        ("ج. الواجهة الأمامية (Frontend)", "H2"),
        ("• Vanilla HTML5, CSS3, & JavaScript (ES6+): تم تفضيلها لضمان أقصى سرعة تحميل وتجنب تعقيدات بيئات العمل الضخمة (مثل React أو Vue). الواجهة متجاوبة بالكامل (Responsive)، وتدعم الوضعين الليلي والنهاري بمظهر عصري يعتمد على تأثيرات الزجاج (Glassmorphism) والأنيميشن الخفيف.", "BODY"),
        
        ("2. دورة حياة الطلب (How it Works)", "H1"),
        ("عندما يرسل المستخدم استفساراً أو يرفع صورة داخل المحادثة، يمر الطلب بالمراحل التالية:", "BODY"),
        ("[استقبال الطلب في main.py]", "DIAGRAM"),
        ("          │", "DIAGRAM"),
        ("          ▼", "DIAGRAM"),
        ("[جلب سجل المحادثة + الملف الصحي]", "DIAGRAM"),
        ("          │", "DIAGRAM"),
        ("          ▼", "DIAGRAM"),
        ("[اتخاذ القرار في agent.py عبر LangGraph]", "DIAGRAM"),
        ("          │", "DIAGRAM"),
        ("          ├─► (سؤال طبي محلي/ملفات) ──► [استدعاء rag_tool والبحث في Pinecone]", "DIAGRAM"),
        ("          ├─► (سؤال عن مستجدات)   ──► [استدعاء medical_web_search في PubMed/NHS]", "DIAGRAM"),
        ("          └─► (تحليل صورة/أشعة)    ──► [تمرير الصورة إلى Gemini 2.5 Flash Vision]", "DIAGRAM"),
        ("          │", "DIAGRAM"),
        ("          ▼", "DIAGRAM"),
        ("[صياغة الرد النهائي وبثه للمستخدم حرفاً بحرف Real-time Stream]", "DIAGRAM"),
        
        ("3. الميزات السريرية والتفاعلية الأساسية (Core Features)", "H1"),
        ("• ذاكرة المحادثة المستمرة (Conversation Memory): يتذكر المساعد سياق الحديث حتى 20 رسالة سابقة، مما يتيح للمستخدم المتابعة بسلاسة دون إعادة شرح المشكلة.", "BODY"),
        ("• الملف الصحي المتكامل (Health Profile): يتيح إدخال البيانات الحيوية (الطول، الوزن، الحساسية، الأدوية الحالية). تُرسل هذه البيانات سرياً مع كل طلب ليقوم المساعد بتقديم نصيحة مفصلة (مثل: التحذير من تعارض دواء جديد مع أدويتك الحالية).", "BODY"),
        ("• فاحص الأعراض الذكي (Symptom Checker): واجهة تمكن المستخدم من تحديد العرض (صداع، ألم بطن...) وتفاصيله، ليقوم المساعد بفحصه مبدئياً وتحديد درجة الخطورة (بسيطة، متوسطة، أو حالة طوارئ خطيرة).", "BODY"),
        ("• الحاسبات الصحية السريعة (Health Calculators): تتضمن حساب مؤشر كتلة الجسم (BMI) بشريط ألوان تفاعلي، السعرات الحرارية اليومية، الوزن المثالي، ونسبة الدهون. بجانب كل نتيجة زر 'اسأل المساعد' لإرسال النتائج للشات وتصميم خطة غذائية مخصصة.", "BODY"),
        ("• منبه الأدوية الذكي (Medication Reminder): يتيح إضافة جدول أدوية يومي، ويقوم النظام بإرسال إشعارات منبثقة بالصوت والصورة لتنبيه المستخدم بموعد الجرعة.", "BODY"),
        ("• تحويل النص إلى كلام (Text-to-Speech): زر استماع تفاعلي بجانب كل إجابة يقرأ النص بصوت طبيعي واضح مع تمييز تلقائي للغة (عربي/إنجليزي).", "BODY"),
        ("• تصدير التقارير (Export to PDF): إمكانية تصدير كامل الملف الصحي، سجل المحادثة، ونتائج الحاسبات في تقرير PDF منسق بضغطة زر واحدة لمشاركته مع الطبيب المختص.", "BODY"),
        
        ("4. هيكل مجلدات المشروع (Directory Structure)", "H1"),
        ("├── main.py                 # نقطة انطلاق التطبيق وإعداد خادم FastAPI والـ Endpoints.", "CODE"),
        ("├── ingest.py               # معالجة ملفات الـ PDF الطبية، تقسيمها، ورفعها إلى Pinecone.", "CODE"),
        ("├── agent/", "CODE"),
        ("│   ├── agent.py            # منطق وبناء الوكيل الذكي عبر LangGraph وإدارة الـ Fallback.", "CODE"),
        ("│   └── utils/", "CODE"),
        ("│       ├── prompt.py       # الـ System Prompt والتعليمات السلوكية والطبية الصارمة للمساعد.", "CODE"),
        ("│       ├── tools.py        # تعريف وتفعيل أدوات البحث (rag_tool & medical_web_search).", "CODE"),
        ("│       └── vision.py       # منطق تحليل الصور والتحاليل الطبية باستخدام Gemini Vision.", "CODE"),
        ("├── templates/", "CODE"),
        ("│   └── index.html          # واجهة المستخدم الهيكلية، المودالات التفاعلية، وجافا سكريبت المشغلة.", "CODE"),
        ("├── static/", "CODE"),
        ("│   └── styles.css          # ملف التصميم الشامل، تأثيرات الألوان، والـ Dark Mode.", "CODE"),
        ("├── .gitignore              # منع رفع ملفات البيئة الافتراضية والمتغيرات الحساسة.", "CODE"),
        ("└── .dockerignore           # تنظيم الملفات المستبعدة عند بناء حاوية Docker.", "CODE"),
    ]
    
    for text, style_type in content:
        # Check remaining space before drawing
        if pdf.get_y() > 260:
            pdf.add_page()
            pdf.set_y(20)
            
        if style_type == "H1":
            pdf.ln(6)
            pdf.set_font("Arial", style="", size=16)
            pdf.set_text_color(30, 58, 138)  # Navy blue
            # Draw header under bar
            h_text = get_display(arabic_reshaper.reshape(text))
            pdf.cell(0, 10, h_text, align="R", new_x="LMARGIN", new_y="NEXT")
            pdf.set_draw_color(30, 58, 138)
            pdf.set_line_width(0.4)
            pdf.line(15, pdf.get_y(), 195, pdf.get_y())
            pdf.ln(4)
            
        elif style_type == "H2":
            pdf.ln(3)
            pdf.set_font("Arial", style="", size=13)
            pdf.set_text_color(70, 70, 70)
            h_text = get_display(arabic_reshaper.reshape(text))
            pdf.cell(0, 8, h_text, align="R", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
            
        elif style_type == "BODY":
            pdf.set_font("Arial", size=10.5)
            pdf.set_text_color(40, 40, 40)
            lines = wrap_and_shape_line(text, max_width_chars=75)
            for line in lines:
                if pdf.get_y() > 270:
                    pdf.add_page()
                    pdf.set_y(20)
                pdf.cell(0, 6.5, line, align="R", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
            
        elif style_type == "DIAGRAM":
            pdf.set_font("Arial", size=9.5)  # Arial handles diagram symbols fine if we shape
            pdf.set_text_color(50, 100, 150)
            reshaped = arabic_reshaper.reshape(text)
            bidi_line = get_display(reshaped)
            pdf.cell(0, 5, bidi_line, align="C", new_x="LMARGIN", new_y="NEXT")
            
        elif style_type == "CODE":
            pdf.set_font("Arial", size=9.5)
            pdf.set_text_color(50, 50, 50)
            reshaped = arabic_reshaper.reshape(text)
            bidi_line = get_display(reshaped)
            pdf.cell(0, 5.5, bidi_line, align="L", new_x="LMARGIN", new_y="NEXT")
            
    # Save the output PDF in the workspace folder dynamically
    output_filename = "Tapep_AI_Project_Documentation.pdf"
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(base_dir, output_filename)
    pdf.output(output_path)
    print(f"SUCCESS: PDF generated at {output_path}")

if __name__ == "__main__":
    create_documentation_pdf()
