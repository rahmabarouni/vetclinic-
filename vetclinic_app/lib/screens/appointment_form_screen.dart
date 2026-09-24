import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/veterinarian.dart';
import '../providers/appointments_provider.dart';
import '../providers/pets_provider.dart';
import '../theme/app_theme.dart';
import '../utils/date_utils.dart';
import 'veterinarian_picker_screen.dart';

class AppointmentFormScreen extends ConsumerStatefulWidget {
  const AppointmentFormScreen({super.key});

  @override
  ConsumerState<AppointmentFormScreen> createState() => _AppointmentFormScreenState();
}

class _AppointmentFormScreenState extends ConsumerState<AppointmentFormScreen> {
  int _currentStep = 0;

  final _reasonController = TextEditingController();
  String? _selectedPetId;
  String _appointmentType = 'CONSULTATION';
  DateTime _selectedDate = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _selectedTime = const TimeOfDay(hour: 10, minute: 0);
  Veterinarian? _selectedVeterinarian;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final petsState = ref.read(petsProvider);
    if (petsState.status == PetsStatus.initial) {
      ref.read(petsProvider.notifier).loadPets();
    }
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  DateTime _buildStart() {
    return DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _selectedTime.hour,
      _selectedTime.minute,
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked != null) setState(() => _selectedTime = picked);
  }

  Future<void> _pickVeterinarian() async {
    final veterinarian = await Navigator.push<Veterinarian>(
      context,
      MaterialPageRoute(builder: (_) => const VeterinarianPickerScreen()),
    );
    if (veterinarian != null && mounted) {
      setState(() => _selectedVeterinarian = veterinarian);
    }
  }

  void _onStepContinue() {
    if (_currentStep == 0 && _selectedPetId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sélectionnez un animal'), backgroundColor: AppColors.error),
      );
      return;
    }
    if (_currentStep == _stepCount - 1) {
      _submit();
      return;
    }
    setState(() => _currentStep++);
  }

  int get _stepCount => 4;

  void _onStepCancel() {
    if (_currentStep == 0) return;
    setState(() => _currentStep--);
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);

    final start = _buildStart();
    final end = start.add(const Duration(hours: 1));

    final success = await ref.read(appointmentsProvider.notifier).createAppointment(
          petId: _selectedPetId!,
          appointmentType: _appointmentType,
          scheduledStart: start,
          scheduledEnd: end,
          reason: _reasonController.text.trim().isEmpty ? null : _reasonController.text.trim(),
          veterinarianId: _selectedVeterinarian?.id,
        );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (success) {
      Navigator.pop(context, true);
    } else {
      final error = ref.read(appointmentsProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'Erreur lors de la création'), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final petsState = ref.watch(petsProvider);
    final pets = petsState.pets;
    final selectedPet = pets.isEmpty
        ? null
        : pets.where((p) => p.id == _selectedPetId).firstOrNull;

    buildSteps() => <Step>[
          Step(
            title: const Text('Animal & date'),
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _selectedPetId,
                  decoration: const InputDecoration(
                    labelText: 'Animal *',
                    prefixIcon: Icon(Icons.pets),
                  ),
                  items: pets.map((pet) {
                    return DropdownMenuItem(value: pet.id, child: Text(pet.name));
                  }).toList(),
                  onChanged: (v) => setState(() => _selectedPetId = v),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.calendar_today),
                        label: Text(
                          '${_selectedDate.day}/${_selectedDate.month}/${_selectedDate.year}',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickTime,
                        icon: const Icon(Icons.access_time),
                        label: Text(
                          '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}',
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Step(
            title: const Text('Vétérinaire'),
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    onTap: _pickVeterinarian,
                    leading: CircleAvatar(
                      backgroundColor: AppColors.primaryLight,
                      child: const Icon(Icons.medical_services, color: AppColors.primary),
                    ),
                    title: Text(
                      _selectedVeterinarian?.displayName ?? 'Choisir un vétérinaire',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      _selectedVeterinarian == null
                          ? 'Sans préférence — attribué automatiquement'
                          : (_selectedVeterinarian!.specialty.isEmpty
                              ? 'Vétérinaire généraliste'
                              : _selectedVeterinarian!.specialty),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                  ),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: () => setState(() => _selectedVeterinarian = null),
                  icon: const Icon(Icons.clear),
                  label: const Text('Sans préférence'),
                ),
              ],
            ),
          ),
          Step(
            title: const Text('Service'),
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _appointmentType,
                  decoration: const InputDecoration(
                    labelText: 'Type *',
                    prefixIcon: Icon(Icons.category),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'CONSULTATION', child: Text('Consultation')),
                    DropdownMenuItem(value: 'VACCINATION', child: Text('Vaccination')),
                    DropdownMenuItem(value: 'SURGERY', child: Text('Chirurgie')),
                    DropdownMenuItem(value: 'EMERGENCY', child: Text('Urgence')),
                    DropdownMenuItem(value: 'CHECKUP', child: Text('Contrôle')),
                    DropdownMenuItem(value: 'GROOMING', child: Text('Toilettage')),
                  ],
                  onChanged: (v) => setState(() => _appointmentType = v ?? 'CONSULTATION'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _reasonController,
                  decoration: const InputDecoration(
                    labelText: 'Motif',
                    prefixIcon: Icon(Icons.notes),
                  ),
                  maxLines: 2,
                ),
              ],
            ),
          ),
          Step(
            title: const Text('Confirmation'),
            content: Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SummaryRow(label: 'Animal', value: selectedPet?.name ?? '—'),
                    _SummaryRow(
                      label: 'Date',
                      value: formatDate(_buildStart().toIso8601String()),
                    ),
                    _SummaryRow(
                      label: 'Vétérinaire',
                      value: _selectedVeterinarian?.displayName ?? 'Sans préférence',
                    ),
                    _SummaryRow(
                      label: 'Service',
                      value: _appointmentTypeLabel,
                    ),
                    if (_reasonController.text.trim().isNotEmpty)
                      _SummaryRow(label: 'Motif', value: _reasonController.text.trim()),
                  ],
                ),
              ),
            ),
          ),
        ];

    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau rendez-vous')),
      body: Stepper(
        currentStep: _currentStep,
        onStepContinue: _onStepContinue,
        onStepCancel: _onStepCancel,
        controlsBuilder: (context, details) {
          if (details.stepIndex != details.currentStep) {
            return const SizedBox.shrink();
          }
          final isLast = _currentStep == _stepCount - 1;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _submitting ? null : details.onStepContinue,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(isLast ? 'Créer le rendez-vous' : 'Suivant'),
                  ),
                ),
                if (_currentStep > 0) ...[
                  const SizedBox(width: 12),
                  OutlinedButton(
                    onPressed: _submitting ? null : details.onStepCancel,
                    child: const Text('Retour'),
                  ),
                ],
              ],
            ),
          );
        },
        steps: buildSteps(),
      ),
    );
  }

  String get _appointmentTypeLabel {
    switch (_appointmentType) {
      case 'VACCINATION':
        return 'Vaccination';
      case 'SURGERY':
        return 'Chirurgie';
      case 'EMERGENCY':
        return 'Urgence';
      case 'CHECKUP':
        return 'Contrôle';
      case 'GROOMING':
        return 'Toilettage';
      default:
        return 'Consultation';
    }
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.w500)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}