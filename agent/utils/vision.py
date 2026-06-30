import os
import base64
import logging
import re
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
logger = logging.getLogger(__name__)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY is missing. Add it to your .env file.")

genai.configure(api_key=GOOGLE_API_KEY)


def _detect_language(text: str) -> str:
    """Detect whether text is primarily Arabic or English."""
    arabic_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    return "ar" if arabic_chars > 0 else "en"


def analyze_medical_image(image_bytes: bytes, mime_type: str, user_question: str = "") -> str:
    """
    Analyze a medical image using Gemini Vision and return a structured clinical report.
    Automatically responds in the same language as the user's question (Arabic or English).
    Supports: X-rays, skin conditions, prescriptions, lab reports, eye images, wounds, rashes, etc.
    """
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")

        # ── Detect user language ───────────────────────────────────────────
        lang = _detect_language(user_question) if user_question else "en"

        if lang == "ar":
            language_instruction = (
                "🌐 **LANGUAGE RULE (MANDATORY):** The patient asked in Arabic. "
                "You MUST write your ENTIRE response in Arabic only (العربية). "
                "Do NOT write any English words except for medical terminology that has no Arabic equivalent, "
                "and even then write the Arabic term first followed by the English in parentheses.\n\n"
            )
            disclaimer = (
                "> ⚠️ **تنبيه مهم:** هذا التحليل لأغراض تعليمية فقط. "
                "يُرجى دائماً استشارة طبيب مختص لتشخيص حالتك وتحديد خطة العلاج المناسبة."
            )
            report_title = "## 🖼️ تقرير تحليل الصورة الطبية"
            sections = (
                "**1. نوع الصورة وجودتها**\n"
                "   - ما نوع هذه الصورة أو الوثيقة؟ (مثل: صورة جلدية، أشعة سينية، CT، MRI، وصفة طبية، تحاليل مخبرية، إلخ)\n"
                "   - تعليق على جودة الصورة ووضوحها.\n\n"
                "**2. الملاحظات البصرية**\n"
                "   - صف بالتفصيل ما تراه (الألوان، الملمس، الشكل، التوزيع، المناطق المتأثرة، أي تشوهات).\n\n"
                "**3. التفسير الطبي**\n"
                "   - ماذا قد تشير إليه هذه النتائج طبياً؟\n"
                "   - اذكر الحالات المحتملة / التشخيصات التفاضلية مرتبةً حسب الاحتمالية.\n\n"
                "**4. تفاصيل الوصفة الطبية** *(إن وُجدت)*\n"
                "   - استخرج وسرد جميع الأدوية والجرعات والتكرار والمدة والتعليمات الخاصة.\n\n"
                "**5. ⚠️ علامات التحذير**\n"
                "   - حدد أي نتائج عاجلة أو خطيرة تستدعي اهتماماً فورياً.\n\n"
                "**6. الخطوات الموصى بها**\n"
                "   - أي متخصص يجب أن يرى المريض؟\n"
                "   - ما الفحوصات أو الإجراءات التالية الموصى بها؟"
            )
        else:
            language_instruction = (
                "🌐 **LANGUAGE RULE:** The patient asked in English. "
                "Write your entire response in English.\n\n"
            )
            disclaimer = (
                "> ⚠️ **Disclaimer:** This AI analysis is for educational purposes only. "
                "Always consult a qualified healthcare professional for diagnosis and treatment decisions."
            )
            report_title = "## 🖼️ Image Analysis Report"
            sections = (
                "**1. Image Type & Quality**\n"
                "   - What type of image/document is this? (skin photo, X-ray, CT, MRI, prescription, lab report, etc.)\n"
                "   - Comment on image quality and visibility.\n\n"
                "**2. Visual Observations**\n"
                "   - Describe exactly what you see in systematic detail.\n\n"
                "**3. Medical Interpretation**\n"
                "   - What could these findings indicate medically?\n"
                "   - List possible conditions / differential diagnoses in order of likelihood.\n\n"
                "**4. Prescription Details** *(if applicable)*\n"
                "   - Extract all medications, dosages, frequency, duration, and special instructions.\n\n"
                "**5. ⚠️ Warning Signs**\n"
                "   - Flag any urgent or concerning findings needing IMMEDIATE attention.\n\n"
                "**6. Recommended Next Steps**\n"
                "   - What specialist should the patient see?\n"
                "   - What tests or follow-up actions are recommended?"
            )

        patient_q = f"\n\n**{'سؤال المريض' if lang == 'ar' else 'Patient question'}:** {user_question}" if user_question else ""

        prompt = (
            "You are **Tapep AI Vision** 🏥, an expert AI medical image analyst.\n\n"
            f"{language_instruction}"
            "Carefully analyze the uploaded medical image and produce a thorough, structured report "
            "covering every applicable section:\n\n"
            "---\n\n"
            f"{report_title}\n\n"
            f"{sections}\n\n"
            "---\n\n"
            f"{patient_q}\n\n"
            f"{disclaimer}"
        )

        image_part = {
            "mime_type": mime_type,
            "data": base64.b64encode(image_bytes).decode("utf-8"),
        }

        response = model.generate_content([prompt, image_part])
        return response.text

    except Exception as e:
        logger.error(f"Vision error: {str(e)}")
        raise RuntimeError(f"Image analysis failed: {str(e)}")


def analyze_lab_report_structured(image_bytes: bytes, mime_type: str, notes: str = "") -> str:
    """
    Analyze a lab test image using Gemini Vision and return a structured JSON string.
    The response is guaranteed to be a JSON object matching LabReportResponse schema.
    """
    try:
        prompt = (
            "You are an expert AI clinical pathologist. Carefully analyze the uploaded lab report or test result image.\n"
            "Extract all laboratory parameters, their values, units, reference ranges, and flag their status (Low, High, or Normal).\n"
            "Also, write a clinical interpretation for each parameter in Arabic, and provide a general summary/recommendation in Arabic.\n\n"
            "You MUST return your response as a valid JSON object matching the following structure:\n"
            "{\n"
            "  \"indicators\": [\n"
            "    {\n"
            "      \"parameter\": \"English name of the parameter\",\n"
            "      \"value\": \"the measured numerical/textual value\",\n"
            "      \"reference_range\": \"the reference/normal range\",\n"
            "      \"unit\": \"the unit of measurement (e.g. g/dL, mg/dL)\",\n"
            "      \"status\": \"Low\" or \"High\" or \"Normal\",\n"
            "      \"interpretation\": \"شرح مبسط وموجز بالعربية لما يعنيه هذا المؤشر بالنسبة للمريض\"\n"
            "    }\n"
            "  ],\n"
            "  \"summary\": \"ملخص طبي شامل لنتائج التحاليل ونصائح توجيهية للمريض بالعربية\"\n"
            "}\n\n"
            f"Patient's additional clinical notes: {notes}\n\n"
            "Strictly return ONLY the raw JSON object. Do not include markdown codeblocks or any additional commentary."
        )

        image_part = {
            "mime_type": mime_type,
            "data": base64.b64encode(image_bytes).decode("utf-8"),
        }

        response_text = None
        last_err = None

        for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                logger.info(f"🔄 [Tapep AI] Trying lab report analysis with model: {model_name}")
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    [prompt, image_part],
                    generation_config={"response_mime_type": "application/json"}
                )
                if response and response.text:
                    response_text = response.text
                    logger.info(f"✅ [Tapep AI] Lab report analysis successful with {model_name}")
                    break
            except Exception as ex:
                logger.warning(f"⚠️ [Tapep AI] Model {model_name} failed: {ex}")
                last_err = ex
                continue

        if not response_text:
            raise last_err if last_err else RuntimeError("All vision models failed for lab report analysis.")
        
        return response_text
    except Exception as e:
        logger.error(f"Structured vision error: {str(e)}")
        raise RuntimeError(f"Lab report analysis failed: {str(e)}")