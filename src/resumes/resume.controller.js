const ForbiddenException = require("../exceptions/forbidden.exception");
const NotFoundException = require("../exceptions/NotFound.exception");
const { ALLOWED_TYPES, MAX_FILE_SIZE } = require("../upload/upload.validation");
const {
    validateS3File,
    copyObject,
    deleteObject,
    generatePresignedGetUrl,
    getObjectBuffer,
    DOWNLOAD_URL_EXPIRES_IN,
} = require("../utils/s3");
const { isObjectId } = require("../utils/objectId");
const { extractText } = require("./resumeText");
const logger = require("../utils/logger");
const Resume = require("./resume.model");

const createResume = async (req, res) => {
    const { fileKey: tmpKey, fileName } = req.body;
    const userId = req.user.id;
    if (!tmpKey.startsWith(`tmp/${userId}/`)) {
        throw new ForbiddenException(
            "File key doesn't belong to the current user",
        );
    }

    const head = await validateS3File(tmpKey, {
        allowedTypes: ALLOWED_TYPES.resume,
        maxFileSize: MAX_FILE_SIZE.resume,
    });
    // filename from the filekey
    // tmp/${userId}/xxxxx
    const filename = tmpKey.slice(`tmp/${userId}/`.length);
    const fileKey = `resume/${userId}/${filename}`;

    await copyObject(tmpKey, fileKey);

    await deleteObject(tmpKey);

    // Read the text now rather than on every chat turn. It costs a second
    // here and saves a download per conversation later; it also means a file
    // we cannot read is known about immediately rather than at the moment the
    // user asks a question about it.
    let extracted = { status: "failed", text: "", pageCount: 0 };
    try {
        extracted = await extractText(await getObjectBuffer(fileKey));
    } catch (err) {
        // extractText swallows its own parse failures, so reaching here means
        // the download did. Either way the upload succeeded and the file is
        // safe; only the text is missing.
        logger.warn("Could not read the uploaded resume back from storage", {
            message: err.message,
        });
    }

    const resume = await Resume.create({
        user: userId,
        fileKey,
        fileName,
        fileSize: head.ContentLength,
        contentText: extracted.text,
        textStatus: extracted.status,
        pageCount: extracted.pageCount,
        textExtractedAt: new Date(),
    });

    res.status(201).json({
        success: true,
        data: resume,
    });
};

const getResumes = async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [resumes, total] = await Promise.all([
        Resume.find({ user: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Resume.countDocuments({ user: userId }),
    ]);

    res.json({
        success: true,
        data: resumes,
        pagination: {
            page,
            limit,
            total,
            // totalPages
        },
    });
};

const findOwnResume = async (resumeId, userId) => {
    // A malformed id is "not found", not a server error. Without this check
    // findById throws a CastError and the caller sees a 500.
    if (!isObjectId(resumeId)) {
        throw new NotFoundException("Resume not found");
    }

    const resume = await Resume.findById(resumeId);
    // Someone else's resume is reported as missing rather than forbidden:
    // "forbidden" confirms the id exists, which is not something a caller
    // should be able to learn.
    if (!resume || resume.user.toString() !== userId) {
        throw new NotFoundException("Resume not found");
    }
    return resume;
};

const downloadResume = async (req, res) => {
    const resume = await findOwnResume(req.params.id, req.user.id);

    const downloadUrl = await generatePresignedGetUrl(
        resume.fileKey,
        resume.fileName,
    );

    res.json({
        success: true,
        data: {
            downloadUrl,
            fileName: resume.fileName,
            expiresIn: DOWNLOAD_URL_EXPIRES_IN,
        },
    });
};

const deleteResume = async (req, res) => {
    const resume = await findOwnResume(req.params.id, req.user.id);

    await deleteObject(resume.fileKey);
    await resume.deleteOne();

    res.sendStatus(204);
};

const resumeController = {
    getResumes,
    createResume,
    deleteResume,
    downloadResume,
};

module.exports = resumeController;
