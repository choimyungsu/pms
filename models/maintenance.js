class Maintenance {
    constructor(id, client_company, check_type, team, primary_engineer, secondary_engineer, target, priority, contract_end_date, remarks, customer, contact, email, inspection_location) {
        this.id = id;
        this.client_company = client_company;
        this.check_type = check_type;
        this.team = team;
        this.primary_engineer = primary_engineer;
        this.secondary_engineer = secondary_engineer;
        this.target = target;
        this.priority = priority;
        this.contract_end_date = contract_end_date;
        this.remarks = remarks;
        this.customer = customer;
        this.contact = contact;
        this.email = email;
        this.inspection_location = inspection_location;
        this.closedAt = null; // Add this field
    }
}

module.exports = Maintenance;
