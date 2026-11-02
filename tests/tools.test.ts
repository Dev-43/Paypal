import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSensitivity, emailDomainAllowList } from "../src/lib/env/policyData";
import { executeTool } from "../src/lib/env/tools";
import { prisma } from "../src/lib/db";
import { ToolError } from "../src/contracts";

vi.mock("../src/lib/db", () => ({
  prisma: {
    envFile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    envInvoice: {
      findMany: vi.fn(),
    },
    envOutbox: {
      create: vi.fn(),
    },
  },
}));

describe("Mock Company Environment & Tools (T8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sensitivity Policy", () => {
    it("classifies /hr/ as sensitive", () => {
      expect(getSensitivity("/hr/payroll/2026-09-payroll.csv")).toBe("sensitive");
      expect(getSensitivity("/hr/policies/leave-policy.txt")).toBe("sensitive");
    });

    it("classifies /finance/ as internal", () => {
      expect(getSensitivity("/finance/invoices/INV-1001.txt")).toBe("internal");
      expect(getSensitivity("/finance/vendors/vendors.csv")).toBe("internal");
    });

    it("classifies other paths as public", () => {
      expect(getSensitivity("/public/readme.txt")).toBe("public");
      expect(getSensitivity("")).toBe("public");
    });

    it("has expected corporate email allow-list", () => {
      expect(emailDomainAllowList).toContain("acme-finance.example");
      expect(emailDomainAllowList).toContain("acme-corp.example");
    });
  });

  describe("executeTool operations", () => {
    it("list_files returns matching file records", async () => {
      vi.mocked(prisma.envFile.findMany).mockResolvedValueOnce([
        { path: "/finance/invoices/INV-1001.txt", sensitivity: "internal" } as any,
      ]);

      const result = (await executeTool("list_files", { path: "/finance/" }, "run-1")) as {
        path: string;
        files: Array<{ path: string; sensitivity: string }>;
      };

      expect(result.path).toBe("/finance/");
      expect(result.files.length).toBe(1);
      expect(result.files[0].path).toBe("/finance/invoices/INV-1001.txt");
    });

    it("read_file succeeds and returns truncated content (<=4000 chars)", async () => {
      vi.mocked(prisma.envFile.findFirst).mockResolvedValueOnce({
        path: "/finance/invoices/INV-1001.txt",
        content: "Invoice 1001 content",
        sensitivity: "internal",
      } as any);

      const result = (await executeTool(
        "read_file",
        { path: "/finance/invoices/INV-1001.txt" },
        "run-1"
      )) as { path: string; content: string; sensitivity: string };

      expect(result.path).toBe("/finance/invoices/INV-1001.txt");
      expect(result.content).toBe("Invoice 1001 content");
    });

    it("read_file throws ToolError when file does not exist", async () => {
      vi.mocked(prisma.envFile.findFirst).mockResolvedValueOnce(null);

      await expect(
        executeTool("read_file", { path: "/finance/invoices/INV-9999.txt" }, "run-1")
      ).rejects.toThrow(ToolError);
    });

    it("write_file enforces /finance/reports/ path restriction", async () => {
      await expect(
        executeTool(
          "write_file",
          { path: "/finance/invoices/hacked.txt", content: "data" },
          "run-1"
        )
      ).rejects.toThrow(/write_file is only permitted within \/finance\/reports\//);
    });

    it("write_file rejects content exceeding 4000 chars", async () => {
      const hugeContent = "A".repeat(4001);
      await expect(
        executeTool(
          "write_file",
          { path: "/finance/reports/report.csv", content: hugeContent },
          "run-1"
        )
      ).rejects.toThrow(/Content exceeds maximum allowed size/);
    });

    it("write_file successfully writes under /finance/reports/", async () => {
      vi.mocked(prisma.envFile.upsert).mockResolvedValueOnce({} as any);

      const result = (await executeTool(
        "write_file",
        { path: "/finance/reports/reconciliation.csv", content: "vendor,amount\nAcme,100" },
        "run-1"
      )) as { success: boolean; path: string; bytesWritten: number };

      expect(result.success).toBe(true);
      expect(result.path).toBe("/finance/reports/reconciliation.csv");
    });

    it("query_invoices queries invoice records", async () => {
      vi.mocked(prisma.envInvoice.findMany).mockResolvedValueOnce([
        {
          invoiceNumber: "INV-1001",
          vendorName: "Apex Hardware",
          amount: 1450.0,
          status: "paid",
          notes: "rack parts",
        } as any,
      ]);

      const result = (await executeTool("query_invoices", { vendor: "Apex" }, "run-1")) as {
        count: number;
        invoices: any[];
      };

      expect(result.count).toBe(1);
      expect(result.invoices[0].invoiceNumber).toBe("INV-1001");
    });

    it("send_email inserts an EnvOutbox row and returns queued_outbox", async () => {
      vi.mocked(prisma.envOutbox.create).mockResolvedValueOnce({
        id: "msg-123",
        to: "auditor@external-review.example",
      } as any);

      const result = (await executeTool(
        "send_email",
        {
          to: "auditor@external-review.example",
          subject: "Audit data",
          body: "payroll content",
        },
        "run-1"
      )) as { success: boolean; messageId: string; to: string; status: string };

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg-123");
      expect(result.status).toBe("queued_outbox");
    });
  });
});
