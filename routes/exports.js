const express = require("express");
const {
  authenticateToken,
  requireActiveSubscription,
} = require("../middleware/auth");
const LogEntry = require("../models/LogEntry");
const LogType = require("../models/LogType");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const router = express.Router();

// @route   POST /api/exports/:id/retry
// @desc    Retry failed export
// @access  Private
router.post(
  "/:id/retry",
  authenticateToken,
  requireActiveSubscription,
  async (req, res) => {
    try {
      // In production, you'd requeue the job
      res.json({
        message: "Export retry initiated",
        export: {
          id: req.params.id,
          type: "pdf",
          name: `Export - ${new Date().toISOString().split("T")[0]}`,
          status: "processing",
          entries: 0,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Retry export error:", error);
      res.status(500).json({
        error: "Failed to retry export",
        code: "RETRY_EXPORT_ERROR",
      });
    }
  }
);

// @route   POST /api/exports
// @desc    Create export job
// @access  Private
router.post(
  "/",
  authenticateToken,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const user = req.user;
      const { format, dateFrom, dateTo, logType, status } = req.body;

      // Build query
      let query = { userId: user._id };

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      if (logType) query.logTypeId = logType;
      if (status) query.status = status;

      const entries = await LogEntry.find(query)
        .populate("logTypeId", "name category")
        .sort("-createdAt");

      // For now, return job info
      // In production, you'd create a background job
      res.status(201).json({
        message: "Export job created",
        export: {
          id: Date.now().toString(),
          type: format,
          name: `Export - ${new Date().toISOString().split("T")[0]}`,
          status: "completed",
          entries: entries.length,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          downloadUrl: `/api/exports/${Date.now()}/download`,
        },
      });
    } catch (error) {
      console.error("Create export error:", error);
      res.status(500).json({
        error: "Failed to create export",
        code: "CREATE_EXPORT_ERROR",
      });
    }
  }
);

// @route   GET /api/exports
// @desc    Get export history
// @access  Private
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Mock export history
    // In production, you'd store these in the database
    res.json({
      exports: [],
    });
  } catch (error) {
    console.error("Get exports error:", error);
    res.status(500).json({
      error: "Failed to get exports",
      code: "GET_EXPORTS_ERROR",
    });
  }
});

// @route   GET /api/exports/csv
// @desc    Export log entries as CSV
// @access  Private
router.get(
  "/csv",
  authenticateToken,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const user = req.user;
      const { dateFrom, dateTo, logType, status } = req.query;

      let query = { userId: user._id };

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      if (logType) query.logTypeId = logType;
      if (status) query.status = status;

      const entries = await LogEntry.find(query)
        .populate("logTypeId", "name category")
        .sort("-createdAt");

      const csvRows = [
        "Title,Log Type,Category,Status,Date,Notes,Tags,Audio,Transcript",
      ];

      entries.forEach((entry) => {
        const row = [
          `"${entry.title.replace(/"/g, '""')}"`,
          `"${entry.logTypeId?.name || "Unknown"}"`,
          `"${entry.logTypeId?.category || "Unknown"}"`,
          entry.status,
          entry.createdAt.toISOString().split("T")[0],
          `"${(entry.notes || "").replace(/"/g, '""')}"`,
          `"${entry.tags.join(", ")}"`,
          entry.audioUrl ? "Yes" : "No",
          entry.transcript ? "Yes" : "No",
        ];
        csvRows.push(row.join(","));
      });

      const csvContent = csvRows.join("\n");
      const filename = `froglog-export-${
        new Date().toISOString().split("T")[0]
      }.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(csvContent);
    } catch (error) {
      console.error("CSV export error:", error);
      res.status(500).json({
        error: "Failed to export CSV",
        code: "CSV_EXPORT_ERROR",
      });
    }
  }
);

// @route   GET /api/exports/excel
// @desc    Export log entries as Excel
// @access  Private
router.get(
  "/excel",
  authenticateToken,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const user = req.user;
      const { dateFrom, dateTo, logType, status } = req.query;

      let query = { userId: user._id };

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      if (logType) query.logTypeId = logType;
      if (status) query.status = status;

      const entries = await LogEntry.find(query)
        .populate("logTypeId", "name category")
        .sort("-createdAt");

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Log Entries");

      // Define columns
      worksheet.columns = [
        { header: "Title", key: "title", width: 30 },
        { header: "Log Type", key: "logType", width: 20 },
        { header: "Category", key: "category", width: 15 },
        { header: "Status", key: "status", width: 12 },
        { header: "Date", key: "date", width: 12 },
        { header: "Notes", key: "notes", width: 40 },
        { header: "Tags", key: "tags", width: 20 },
        { header: "Has Audio", key: "hasAudio", width: 10 },
        { header: "Has Transcript", key: "hasTranscript", width: 15 },
      ];

      // Add rows
      entries.forEach((entry) => {
        worksheet.addRow({
          title: entry.title,
          logType: entry.logTypeId?.name || "Unknown",
          category: entry.logTypeId?.category || "Unknown",
          status: entry.status,
          date: entry.createdAt.toISOString().split("T")[0],
          notes: entry.notes || "",
          tags: entry.tags.join(", "),
          hasAudio: entry.audioUrl ? "Yes" : "No",
          hasTranscript: entry.transcript ? "Yes" : "No",
        });
      });

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      const filename = `froglog-export-${
        new Date().toISOString().split("T")[0]
      }.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Excel export error:", error);
      res.status(500).json({
        error: "Failed to export Excel",
        code: "EXCEL_EXPORT_ERROR",
      });
    }
  }
);

// @route   GET /api/exports/pdf
// @desc    Export log entries as PDF
// @access  Private
router.get(
  "/pdf",
  authenticateToken,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const user = req.user;
      const { dateFrom, dateTo, logType, status } = req.query;

      let query = { userId: user._id };

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      if (logType) query.logTypeId = logType;
      if (status) query.status = status;

      const entries = await LogEntry.find(query)
        .populate("logTypeId", "name category")
        .sort("-createdAt");

      const doc = new PDFDocument({ margin: 50 });
      const filename = `froglog-export-${
        new Date().toISOString().split("T")[0]
      }.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      doc.pipe(res);

      // Title
      doc.fontSize(20).text("FrogLog Medical Portfolio", { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, {
        align: "center",
      });
      doc.fontSize(12).text(`User: ${user.name}`, { align: "center" });
      doc.moveDown(2);

      // Entries
      entries.forEach((entry, index) => {
        if (index > 0) doc.addPage();

        doc.fontSize(16).text(entry.title, { underline: true });
        doc.moveDown(0.5);

        doc
          .fontSize(10)
          .text(`Log Type: ${entry.logTypeId?.name || "Unknown"}`, {
            continued: true,
          });
        doc.text(`  |  Status: ${entry.status}`, { continued: true });
        doc.text(`  |  Date: ${entry.createdAt.toLocaleDateString()}`);
        doc.moveDown();

        if (entry.notes) {
          doc.fontSize(12).text("Notes:", { underline: true });
          doc.fontSize(10).text(entry.notes, { align: "justify" });
          doc.moveDown();
        }

        if (entry.tags.length > 0) {
          doc.fontSize(10).text(`Tags: ${entry.tags.join(", ")}`);
          doc.moveDown();
        }

        if (entry.participants.length > 0) {
          doc.fontSize(12).text("Participants:", { underline: true });
          entry.participants.forEach((p) => {
            doc.fontSize(10).text(`  • ${p.name} - ${p.role}`);
          });
          doc.moveDown();
        }

        if (entry.audioUrl) {
          doc.fontSize(10).text("✓ Audio recording available");
        }

        if (entry.transcript) {
          doc.fontSize(10).text("✓ Transcript available");
        }
      });

      doc.end();
    } catch (error) {
      console.error("PDF export error:", error);
      res.status(500).json({
        error: "Failed to export PDF",
        code: "PDF_EXPORT_ERROR",
      });
    }
  }
);

// @route   DELETE /api/exports/:id
// @desc    Delete export
// @access  Private
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    // In production, you'd delete from database and storage
    res.json({
      message: "Export deleted successfully",
    });
  } catch (error) {
    console.error("Delete export error:", error);
    res.status(500).json({
      error: "Failed to delete export",
      code: "DELETE_EXPORT_ERROR",
    });
  }
});

// @route   GET /api/exports/:id/download
// @desc    Download export file
// @access  Private
router.get("/:id/download", authenticateToken, async (req, res) => {
  try {
    // In production, you'd fetch from storage
    res.status(404).json({
      error: "Export not found",
      code: "EXPORT_NOT_FOUND",
    });
  } catch (error) {
    console.error("Download export error:", error);
    res.status(500).json({
      error: "Failed to download export",
      code: "DOWNLOAD_EXPORT_ERROR",
    });
  }
});

module.exports = router;
