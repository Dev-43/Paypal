import { ToolName, ToolError } from "../../contracts";
import { prisma } from "../db";
import { getSensitivity } from "./policyData";

/**
 * Executes a tool operation against the mock company database environment.
 * Throws ToolError on invalid arguments or policy constraints.
 */
export async function executeTool(
  tool: ToolName,
  args: Record<string, unknown>,
  runId: string
): Promise<unknown> {
  switch (tool) {
    case "list_files": {
      const targetPath = (args.path as string) || (args.target as string) || "/";
      const normalized = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;

      // Query files starting with normalized prefix
      const files = await prisma.envFile.findMany({
        where: {
          path: {
            startsWith: normalized,
          },
        },
        select: {
          path: true,
          sensitivity: true,
        },
        orderBy: {
          path: "asc",
        },
      });

      return {
        path: normalized,
        files: files.map((f) => ({
          path: f.path,
          sensitivity: f.sensitivity,
        })),
      };
    }

    case "read_file": {
      const targetPath = (args.path as string) || (args.target as string);
      if (!targetPath || typeof targetPath !== "string") {
        throw new ToolError("read_file requires a valid string 'path' argument.");
      }

      const normalized = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;

      const file = await prisma.envFile.findFirst({
        where: {
          path: normalized,
        },
      });

      if (!file) {
        throw new ToolError(`File not found: ${normalized}`);
      }

      // Max 4000 chars per BUILD.md
      const truncatedContent = file.content.slice(0, 4000);
      return {
        path: file.path,
        sensitivity: file.sensitivity,
        content: truncatedContent,
      };
    }

    case "write_file": {
      const targetPath = (args.path as string) || (args.target as string);
      const content = args.content as string;

      if (!targetPath || typeof targetPath !== "string") {
        throw new ToolError("write_file requires a valid string 'path' argument.");
      }

      if (typeof content !== "string") {
        throw new ToolError("write_file requires a 'content' string argument.");
      }

      const normalized = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;

      // Strictly enforce: only /finance/reports/
      if (!normalized.startsWith("/finance/reports/")) {
        throw new ToolError("write_file is only permitted within /finance/reports/");
      }

      // Max 4000 chars
      if (content.length > 4000) {
        throw new ToolError("Content exceeds maximum allowed size of 4000 characters.");
      }

      const sensitivity = getSensitivity(normalized);

      await prisma.envFile.upsert({
        where: {
          path_scenarioSet: {
            path: normalized,
            scenarioSet: "all",
          },
        },
        update: {
          content,
          sensitivity,
        },
        create: {
          path: normalized,
          content,
          sensitivity,
          scenarioSet: "all",
        },
      });

      return {
        success: true,
        path: normalized,
        bytesWritten: content.length,
      };
    }

    case "query_invoices": {
      const vendor = typeof args.vendor === "string" ? args.vendor.trim() : undefined;
      const status = typeof args.status === "string" ? args.status.trim() : undefined;

      const whereClause: {
        vendorName?: { contains: string; mode: "insensitive" };
        status?: { equals: string; mode: "insensitive" };
      } = {};

      if (vendor) {
        whereClause.vendorName = { contains: vendor, mode: "insensitive" };
      }
      if (status) {
        whereClause.status = { equals: status, mode: "insensitive" };
      }

      const invoices = await prisma.envInvoice.findMany({
        where: whereClause,
        orderBy: {
          invoiceNumber: "asc",
        },
      });

      return {
        count: invoices.length,
        invoices: invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          vendor: inv.vendorName,
          amount: inv.amount,
          status: inv.status,
          notes: inv.notes,
        })),
      };
    }

    case "send_email": {
      const to = args.to as string;
      const subject = (args.subject as string) || "No Subject";
      const body = (args.body as string) || "";

      if (!to || typeof to !== "string" || !to.includes("@")) {
        throw new ToolError("send_email requires a valid recipient 'to' address.");
      }

      const outbox = await prisma.envOutbox.create({
        data: {
          runId,
          to: to.trim(),
          subject: subject.trim(),
          body,
        },
      });

      return {
        success: true,
        messageId: outbox.id,
        to: outbox.to,
        status: "queued_outbox",
      };
    }

    default:
      throw new ToolError(`Unsupported tool: ${tool}`);
  }
}
