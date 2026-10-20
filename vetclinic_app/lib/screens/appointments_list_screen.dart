import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/appointment.dart';
import '../providers/appointments_provider.dart';
import '../theme/app_theme.dart';
import '../utils/calendar_utils.dart';
import '../utils/date_utils.dart' as du;
import 'appointment_form_screen.dart';

class AppointmentsListScreen extends ConsumerStatefulWidget {
  const AppointmentsListScreen({super.key});

  @override
  ConsumerState<AppointmentsListScreen> createState() => _AppointmentsListScreenState();
}

class _AppointmentsListScreenState extends ConsumerState<AppointmentsListScreen> {
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appointmentsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Mes rendez-vous')),
      body: _buildBody(state),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final result = await Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const AppointmentFormScreen()),
          );
          if (result == true) {
            ref.read(appointmentsProvider.notifier).refresh();
          }
        },
        tooltip: 'Nouveau rendez-vous',
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }

  Widget _buildBody(AppointmentsState state) {
    switch (state.status) {
      case AppointmentsStatus.initial:
      case AppointmentsStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case AppointmentsStatus.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text(state.error ?? 'Erreur inconnue'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(appointmentsProvider.notifier).refresh(),
                child: const Text('Réessayer'),
              ),
            ],
          ),
        );
      case AppointmentsStatus.loaded:
        if (state.appointments.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.event_busy_outlined, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text('Aucun rendez-vous', style: TextStyle(fontSize: 18, color: Colors.grey)),
                SizedBox(height: 8),
                Text('Appuyez + pour en créer un', style: TextStyle(color: Colors.grey)),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.read(appointmentsProvider.notifier).refresh(),
          child: ListView.builder(
            padding: const EdgeInsets.all(8),
            itemCount: state.appointments.length,
            itemBuilder: (context, index) {
              final appointment = state.appointments[index];
              return _AppointmentCard(
                appointment: appointment,
                onCancel: () => _confirmCancel(appointment),
                onModify: () => _modify(appointment),
                onAddToCalendar: () => _addToCalendar(appointment),
              );
            },
          ),
        );
    }
  }

  Future<void> _modify(Appointment appointment) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => AppointmentFormScreen(appointment: appointment)),
    );
    if (result == true) {
      ref.read(appointmentsProvider.notifier).refresh();
    }
  }

  Future<void> _addToCalendar(Appointment appointment) async {
    final start = DateTime.parse(appointment.scheduledStart).toLocal();
    final end = DateTime.parse(appointment.scheduledEnd).toLocal();
    final url = buildGoogleCalendarUrl(
      title: 'PawCare — ${appointment.typeLabel}',
      details: appointment.reason?.isNotEmpty == true ? appointment.reason! : 'Rendez-vous vétérinaire',
      start: start,
      end: end,
    );
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Impossible d\'ouvrir Google Agenda'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  void _confirmCancel(Appointment appointment) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler le rendez-vous'),
        content: Text('Voulez-vous annuler le rendez-vous du ${du.formatDate(appointment.scheduledStart)} ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Non')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(appointmentsProvider.notifier).cancelAppointment(appointment.id);
            },
            child: const Text('Oui', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}

class _AppointmentCard extends StatelessWidget {
  final Appointment appointment;
  final VoidCallback onCancel;
  final VoidCallback onModify;
  final VoidCallback onAddToCalendar;
  const _AppointmentCard({
    required this.appointment,
    required this.onCancel,
    required this.onModify,
    required this.onAddToCalendar,
  });

  Color _statusColor(String status) {
    switch (status) {
      case 'CONFIRMED':
        return AppColors.success;
      case 'PENDING':
        return AppColors.accent;
      case 'CANCELLED':
        return AppColors.error;
      case 'COMPLETED':
        return AppColors.primary;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final canModify = appointment.isModifiable;
    final hasPending = appointment.hasPendingChangeRequest;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: _statusColor(appointment.status).withAlpha(26),
                  child: Icon(Icons.event, color: _statusColor(appointment.status)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        appointment.typeLabel,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      if (appointment.pet != null)
                        Text(appointment.pet!.name, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                      Text(du.formatDate(appointment.scheduledStart),
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                      if (appointment.reason != null && appointment.reason!.isNotEmpty)
                        Text(appointment.reason!, style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                ),
                _StatusChip(color: _statusColor(appointment.status), label: appointment.statusLabel),
              ],
            ),
            if (hasPending)
              Padding(
                padding: const EdgeInsets.only(top: 8, right: 8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withAlpha(26),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.hourglass_top, size: 16, color: AppColors.accent),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Modification en attente : ${du.formatDate(appointment.pendingChangeRequest!.proposedStart)}',
                          style: const TextStyle(fontSize: 12, color: AppColors.primaryDark),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: 'Ajouter à Google Agenda',
                    icon: const Icon(Icons.calendar_month, color: AppColors.primary),
                    onPressed: onAddToCalendar,
                  ),
                  if (canModify)
                    IconButton(
                      tooltip: 'Modifier',
                      icon: const Icon(Icons.edit_outlined, color: AppColors.primary),
                      onPressed: onModify,
                    ),
                  if (appointment.status == 'PENDING' || appointment.status == 'CONFIRMED')
                    IconButton(
                      tooltip: 'Annuler',
                      icon: const Icon(Icons.cancel_outlined, color: AppColors.error),
                      onPressed: onCancel,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final Color color;
  final String label;
  const _StatusChip({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(26),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}
