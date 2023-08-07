import { createTRPCRouter, adminRoleProtectedRoute } from "~/server/api/trpc";
import { z } from "zod";
import * as ztController from "~/utils/ztApi";
import ejs from "ejs";
import {
	forgotPasswordTemplate,
	inviteUserTemplate,
	notificationTemplate,
} from "~/utils/mail";
import { createTransporter, sendEmail } from "~/utils/mail";
import type nodemailer from "nodemailer";
import { Role } from "@prisma/client";
import { throwError } from "~/server/helpers/errorHandler";
import { type ZTControllerNodeStatus } from "~/types/ztController";

export const adminRouter = createTRPCRouter({
	getUsers: adminRoleProtectedRoute.query(async ({ ctx }) => {
		const users = await ctx.prisma.user.findMany({
			select: {
				id: true,
				name: true,
				email: true,
				emailVerified: true,
				lastLogin: true,
				lastseen: true,
				online: true,
				role: true,
				_count: {
					select: {
						network: true,
					},
				},
				// network: {
				//   select: {
				//     nwid: true,
				//     nwname: true,
				//   },
				// },
			},
		});
		return users;
	}),

	getControllerStats: adminRoleProtectedRoute.query(async () => {
		const isCentral = false;
		const networks = await ztController.get_controller_networks(isCentral);

		const networkCount = networks.length;
		let totalMembers = 0;
		for (const network of networks) {
			const members = await ztController.network_members(network as string);
			totalMembers += Object.keys(members).length;
		}

		const controllerStatus = (await ztController.get_controller_status(
			isCentral,
		)) as ZTControllerNodeStatus;
		return {
			networkCount,
			totalMembers,
			controllerStatus,
		};
	}),

	// Set global options
	getAllOptions: adminRoleProtectedRoute.query(async ({ ctx }) => {
		return await ctx.prisma.globalOptions.findFirst({
			where: {
				id: 1,
			},
		});
	}),
	// Set global options
	changeRole: adminRoleProtectedRoute
		.input(
			z.object({
				role: z
					.string()
					.refine((value) => Object.values(Role).includes(value as Role), {
						message: "Role is not valid",
						path: ["role"],
					}),
				id: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, role } = input;

			if (ctx.session.user.id === id) {
				throwError("You can't change your own role");
			}
			return await ctx.prisma.user.update({
				where: {
					id,
				},
				data: {
					role: role as Role,
				},
			});
		}),
	updateGlobalOptions: adminRoleProtectedRoute
		.input(
			z.object({
				enableRegistration: z.boolean().optional(),
				firstUserRegistration: z.boolean().optional(),
				userRegistrationNotification: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return await ctx.prisma.globalOptions.update({
				where: {
					id: 1,
				},
				data: {
					...input,
				},
			});
		}),
	getMailTemplates: adminRoleProtectedRoute
		.input(
			z.object({
				template: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const templates = await ctx.prisma.globalOptions.findFirst({
				where: {
					id: 1,
				},
			});

			switch (input.template) {
				case "inviteUserTemplate":
					return templates?.inviteUserTemplate ?? inviteUserTemplate();
				case "forgotPasswordTemplate":
					return templates?.forgotPasswordTemplate ?? forgotPasswordTemplate();
				case "notificationTemplate":
					return templates?.notificationTemplate ?? notificationTemplate();
				default:
					return {};
			}
		}),

	setMail: adminRoleProtectedRoute
		.input(
			z.object({
				smtpHost: z.string().optional(),
				smtpPort: z.string().optional(),
				smtpSecure: z.boolean().optional(),
				smtpEmail: z.string().optional(),
				smtpPassword: z.string().optional(),
				smtpUsername: z.string().optional(),
				smtpUseSSL: z.boolean().optional(),
				smtpIgnoreTLS: z.boolean().optional(),
				smtpRequireTLS: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return await ctx.prisma.globalOptions.update({
				where: {
					id: 1,
				},
				data: {
					...input,
				},
			});
		}),
	setMailTemplates: adminRoleProtectedRoute
		.input(
			z.object({
				template: z.string(),
				type: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const templateObj = JSON.parse(input.template) as string;
			switch (input.type) {
				case "inviteUserTemplate":
					return await ctx.prisma.globalOptions.update({
						where: {
							id: 1,
						},
						data: {
							inviteUserTemplate: templateObj,
						},
					});
				case "forgotPasswordTemplate":
					return await ctx.prisma.globalOptions.update({
						where: {
							id: 1,
						},
						data: {
							forgotPasswordTemplate: templateObj,
						},
					});
				case "notificationTemplate":
					return await ctx.prisma.globalOptions.update({
						where: {
							id: 1,
						},
						data: {
							notificationTemplate: templateObj,
						},
					});
				default:
					break;
			}
		}),
	getDefaultMailTemplate: adminRoleProtectedRoute
		.input(
			z.object({
				template: z.string(),
			}),
		)
		.mutation(({ input }) => {
			switch (input.template) {
				case "inviteUserTemplate":
					return inviteUserTemplate();
				case "forgotPasswordTemplate":
					return forgotPasswordTemplate();
				case "notificationTemplate":
					return notificationTemplate();
				default:
					break;
			}
		}),
	sendTestMail: adminRoleProtectedRoute
		.input(
			z.object({
				type: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const globalOptions = await ctx.prisma.globalOptions.findFirst({
				where: {
					id: 1,
				},
			});

			async function sendTemplateEmail(templateName, template) {
				const renderedTemplate = await ejs.render(
					JSON.stringify(template),
					{
						toEmail: ctx.session.user.email,
						toName: ctx.session.user.name,
						fromName: ctx.session.user.name,
						forgotLink: "https://example.com",
						notificationMessage: "Test notification message",
						nwid: "123456789",
					},
					{ async: true },
				);

				const parsedTemplate = JSON.parse(renderedTemplate) as Record<
					string,
					string
				>;

				const transporter: nodemailer.Transporter =
					createTransporter(globalOptions);

				// Define mail options
				const mailOptions = {
					from: globalOptions.smtpEmail,
					to: ctx.session.user.email,
					subject: parsedTemplate.subject,
					html: parsedTemplate.body,
				};

				// Send test mail to user
				await sendEmail(transporter, mailOptions);
			}

			switch (input.type) {
				case "inviteUserTemplate": {
					const defaultInviteTemplate = inviteUserTemplate();
					const inviteTemplate =
						globalOptions?.inviteUserTemplate ?? defaultInviteTemplate;
					await sendTemplateEmail("inviteUser", inviteTemplate);
					break;
				}

				case "forgotPasswordTemplate": {
					const defaultForgotTemplate = forgotPasswordTemplate();
					const forgotTemplate =
						globalOptions?.forgotPasswordTemplate ?? defaultForgotTemplate;
					await sendTemplateEmail("forgotPassword", forgotTemplate);
					break;
				}
				case "notificationTemplate": {
					const defaultNotificationTemplate = notificationTemplate();
					const notifiyTemplate =
						globalOptions?.notificationTemplate ?? defaultNotificationTemplate;
					await sendTemplateEmail("notificationTemplate", notifiyTemplate);
					break;
				}
				default:
					break;
			}
		}),

	/**
	 * Update the specified NetworkMemberNotation instance.
	 *
	 * This protectedProcedure takes an input of object type with properties: notationId, nodeid,
	 * useAsTableBackground, and showMarkerInTable. It updates the fields showMarkerInTable and
	 * useAsTableBackground in the NetworkMemberNotation model for the specified notationId and nodeid.
	 *
	 * @input An object with properties:
	 * - notationId: a number representing the unique ID of the notation
	 * - nodeid: a number representing the ID of the node to which the notation is linked
	 * - useAsTableBackground: an optional boolean that determines whether the notation is used as a background in the table
	 * - showMarkerInTable: an optional boolean that determines whether to show a marker in the table for the notation
	 * @returns A Promise that resolves with the updated NetworkMemberNotation instance.
	 */
	updateGlobalNotation: adminRoleProtectedRoute
		.input(
			z.object({
				useNotationColorAsBg: z.boolean().optional(),
				showNotationMarkerInTableRow: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return await ctx.prisma.globalOptions.update({
				where: {
					id: 1,
				},
				data: {
					useNotationColorAsBg: input.useNotationColorAsBg,
					showNotationMarkerInTableRow: input.showNotationMarkerInTableRow,
				},
			});
		}),
});
