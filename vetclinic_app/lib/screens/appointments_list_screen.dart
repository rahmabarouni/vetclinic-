import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/appointment.dart';
import '../providers/appointments_provider.dart';
import '../utils/date_utils.dart';
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
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
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
                Icon(Icons.event, size: 64, color: Colors.grey),
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
              );
            },
          ),
        );
    }
  }

  void _confirmCancel(Appointment appointment) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Annuler le rendez-vous'),
        content: Text('Voulez-vous annuler le rendez-vous du ${formatDate(appointment.scheduledStart)} ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Non')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(appointmentsProvider.notifier).cancelAppointment(appointment.id);
            },
            child: const Text('Oui', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

}

class _AppointmentCard extends StatelessWidget {
  final Appointment appointment;
  final VoidCallback onCancel;
  const _AppointmentCard({required this.appointment, required this.onCancel});

  Color _statusColor(String status) {
    switch (status) {
      case 'CONFIRMED':
        return Colors.green;
      case 'PENDING':
        return Colors.orange;
      case 'CANCELLED':
        return Colors.red;
      case 'COMPLETED':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        title: Text(
          appointment.typeLabel,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (appointment.pet != null)
              Text(appointment.pet!.name),
            Text(formatDate(appointment.scheduledStart)),
            if (appointment.reason != null && appointment.reason!.isNotEmpty)
              Text(appointment.reason!, style: const TextStyle(fontSize: 12)),
          ],
        ),
        leading: CircleAvatar(
          backgroundColor: _statusColor(appointment.status).withAlpha(26),
          child: Icon(Icons.event, color: _statusColor(appointment.status)),
        ),
        trailing: appointment.status == 'PENDING'
            ? IconButton(
                icon: const Icon(Icons.cancel, color: Colors.red),
                onPressed: onCancel,
              )
            : null,
      ),
    );
  }

}
