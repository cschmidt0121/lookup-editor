
require.config({
    paths: {
    	Handsontable: "../app/lookup_editor/js/lib/handsontable.full.min",
        text: "../app/lookup_editor/js/lib/text",
        console: '../app/lookup_editor/js/lib/console',
        csv: '../app/lookup_editor/js/lib/csv'
    },
    shim: {
        'Handsontable': {
            deps: ['jquery']
        }
    }
});

define([
    "underscore",
    "backbone",
    "models/SplunkDBase",
    "collections/SplunkDsBase",
    "splunkjs/mvc",
    "util/splunkd_utils",
    "jquery",
    "splunkjs/mvc/simplesplunkview",
    "splunkjs/mvc/simpleform/input/text",
    "splunkjs/mvc/simpleform/input/dropdown",
    "text!../app/lookup_editor/js/templates/LookupEdit.html",
    "csv",
    "Handsontable",
    "bootstrap.dropdown",
    "splunk.util",
    "css!../app/lookup_editor/css/LookupEdit.css",
    "css!../app/lookup_editor/css/lib/handsontable.full.min.css"
], function(
    _,
    Backbone,
    SplunkDBaseModel,
    SplunkDsBaseCollection,
    mvc,
    splunkd_utils,
    $,
    SimpleSplunkView,
    TextInput,
    DropdownInput,
    Template
){
	
	var Apps = SplunkDsBaseCollection.extend({
	    url: "apps/local",
	    initialize: function() {
	      SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
	    }
	});
	
	var KVLookup = SplunkDBaseModel.extend({
	    initialize: function() {
	    	SplunkDBaseModel.prototype.initialize.apply(this, arguments);
	    }
	});
	
	var Backup = Backbone.Model.extend();
	
	var Backups = Backbone.Collection.extend({
	    url: Splunk.util.make_full_url("/custom/lookup_editor/lookup_edit/get_lookup_backups_list"),
	    model: Backup
	});
	
	
    // Define the custom view class
    var LookupEditView = SimpleSplunkView.extend({
        className: "LookupEditView",
        
        defaults: {
        	
        },
        
        /**
         * Initialize the class.
         */
        initialize: function() {
        	this.options = _.extend({}, this.defaults, this.options);
        	
            this.backups = null;
            
            // The information for the loaded lookup
            this.lookup = null;
            this.namespace = null;
            this.owner = null;
            this.lookup_type = null;
            this.lookup_config = null;
            this.is_read_only = false; // We will update this to true if the lookup cannot be edited
            
        	// Get the apps
        	this.apps = new Apps();
        	this.apps.on('reset', this.gotApps.bind(this), this);
        	
        	this.apps.fetch({
                success: function() {
                  console.info("Successfully retrieved the list of applications");
                },
                error: function() {
                  console.error("Unable to fetch the apps");
                }
            });
        	
        	this.is_new = true;
        	
        	this.info_message_posted_time = null;
        	
        	setInterval(this.hideInfoMessageIfNecessary.bind(this), 1000);
        },
        
        events: {
        	// Filtering
        	"click #save" : "doSaveLookup",
        	"click .backup-version" : "doLoadBackup",
        	"click #choose-import-file" : "chooseImportFile",
        	"click #import-file" : "openFileImportModal",
        	"change #import-file-input" : "importFile",
        	//"dragover #drop-zone" : "onDragFile",
        	"dragenter #lookup-table" : "onDragFileEnter",
        	"dragleave #lookup-table": "onDragFileEnd",
        	//"dragenter #drop-zone" : "onDragFileEnter",
        	//"dragenter #drop-zone" : "onDragFileEnd",
        	//"drop #drop-zone" : "onDropFile"
        },
        
        /**
         * Hide the informational message if it is old enough
         */
        hideInfoMessageIfNecessary: function(){
        	if(this.info_message_posted_time && ((this.info_message_posted_time + 5000) < new Date().getTime() )){
        		this.info_message_posted_time = null;
        		$("#info-message", this.$el).fadeOut(200);
        	}
        },
        
        /**
         * For some reason the backbone handlers don't work.
         */
        setupDragDropHandlers: function(){
        	
        	// Setup a handler for handling files dropped on the table
        	var drop_zone = document.getElementById('lookup-table');
        	this.setupDragDropHandlerOnElement(drop_zone);
        	
        	// Setup a handler for handling files dropped on the import dialog
        	drop_zone2 = document.getElementById('import-file-modal');
        	this.setupDragDropHandlerOnElement(drop_zone2);
        	
        },
        
        setupDragDropHandlerOnElement: function(drop_zone){
        	
        	drop_zone.ondragover = function (e) {
        		e.preventDefault();
        		e.dataTransfer.dropEffect = 'copy';
        	}.bind(this);
        	
        	drop_zone.ondrop = function (e) {
        	      e.preventDefault();
        	      this.onDropFile(e);
        	      return false;
        	}.bind(this);
        },
        
        /**
         * Cell renderer for HandsOnTable
         */
        lookupRenderer: function(instance, td, row, col, prop, value, cellProperties) {
        	
        	Handsontable.renderers.TextRenderer.apply(this, arguments);

        	if( (!value || value === '') && row === 0) {
        		td.className = 'cellEmptyHeader';
        	}
        	else if(!value || value === '') {
        		td.className = 'cellEmpty';
        	}
        	else if (parseFloat(value) < 0) { //if row contains negative number
        		td.className = 'cellNegative';
        	}
        	else if( String(value).substring(0, 7) == "http://" || String(value).substring(0, 8) == "https://"){
        		td.className = 'cellHREF';
        	}
        	else if (parseFloat(value) > 0) { //if row contains positive number
        		td.className = 'cellPositive';
        	}
        	else if(row === 0) {
        		td.className = 'cellHeader';
        	}
        	else if(value !== null && value.toLowerCase() === 'true') {
        		td.className = 'cellTrue';
        	}
        	else if(value !== null && value.toLowerCase() ==='false') {
        		td.className = 'cellFalse';
        	}
        	else if(value !== null && value.toLowerCase() === 'unknown') {
        		td.className = 'cellUrgencyUnknown';
        	}
        	else if(value !== null && value.toLowerCase() === 'informational') {
        		td.className = 'cellUrgencyInformational';
        	}
        	else if(value !== null && value.toLowerCase() === 'low') {
        		td.className = 'cellUrgencyLow';
        	}
        	else if(value !== null && value.toLowerCase() === 'medium') {
        		td.className = 'cellUrgencyMedium';
        	}
        	else if(value !== null && value.toLowerCase() === 'high') {
        		td.className = 'cellUrgencyHigh';
        	}
        	else if(value !== null && value.toLowerCase() === 'critical') {
        		td.className = 'cellUrgencyCritical';
        	}
        	else {
        		td.className = '';
        	}
        	
        	if(cellProperties.readOnly) {
        	    td.style.opacity = 0.7;
        	}
        	
        },
        
        /**
         * Open the modal for importing a file.
         */
        openFileImportModal: function(){
        	
        	$('.dragging').removeClass('dragging');
        	
        	$('#import-file-modal', this.$el).modal();
        	
        	// Setuo handlers for drag & drop
        	$('.modal-backdrop').on('dragenter', function(){
        		$('.modal-body').addClass('dragging');
        		console.log("enter");
        	});
        	
        	$('.modal-backdrop').on('dragleave', function(){
        		$('.modal-body').removeClass('dragging');
        		console.log("leave");
        	});
        	
        	$('#import-file-modal').on('dragenter', function(){
        		$('.modal-body').addClass('dragging');
        		console.log("enter");
        	});
        	
        	/*
        	$('#import-file-modal').on('dragleave', function(){
        		$('.modal-body').removeClass('dragging');
        		console.log("leave");
        	});
        	*/
        },
        
        /**
         * Open the file dialog to select a file to import.
         */
        chooseImportFile: function(){
        	$("#import-file-input").click();
        },
        
        /**
         * Load the selected lookup from from the history.
         * 
         * @param version The version of the lookup file to load (a value of null will load the latest version)
         */
        loadBackupFile: function(version){
        	
        	// Load a default for the version
        	if( typeof version == 'undefined' ){
        		version = null;
        	}
        	
        	var r = confirm('This version the lookup file will now be loaded.\n\nUnsaved changes will be overridden.');
        	
        	if (r == true) {
        		this.loadLookupContents(this.lookup, this.namespace, this.owner, this.lookup_type, false, version);
        		return true;
        	}
        	else{
        		return false;
        	}
        },
        
        /**
         * Hide the warning message.
         */
        hideWarningMessage: function(){
        	this.hide($("#warning-message", this.$el));
        },
        
        /**
         * Hide the informational message
         */
        hideInfoMessage: function(){
        	this.hide($("#info-message", this.$el));
        },
        
        /**
         * Hide the messages.
         */
        hideMessages: function(){
        	this.hideWarningMessage();
        	this.hideInfoMessage();
        },
        
        /**
         * Show a warning noting that something bad happened.
         */
        showWarningMessage: function(message){
        	$("#warning-message > .message", this.$el).text(message);
        	this.unhide($("#warning-message", this.$el));
        },
        
        /**
         * Show a warning noting that something bad happened.
         */
        showInfoMessage: function(message){
        	$("#info-message > .message", this.$el).text(message);
        	this.unhide($("#info-message", this.$el));
        	
        	this.info_message_posted_time = new Date().getTime();
        },
        
        /**
         * Load the list of backup lookup files.
         * 
         * @param lookup_file The name of the lookup file
         * @param namespace The app where the lookup file exists
         * @param user The user that owns the file (in the case of user-based lookups)
         */
        loadLookupBackupsList: function(lookup_file, namespace, user){
        	
        	var data = {"lookup_file":lookup_file,
                	    "namespace":namespace};
    	
        	
        	// Populate the default parameter in case user wasn't provided
        	if( typeof user === 'undefined' ){
        		user = null;
        	}

        	// If a user was defined, then pass the name as a parameter
        	if(user !== null){
        		data["owner"] = user;
        	}
        	
        	// Fetch them
        	this.backups = new Backups();
        	this.backups.fetch({
        		data: $.param(data),
        		success: this.renderBackupsList.bind(this)
        	});
        	
        },
        
        onDragFile: function(evt){
        	evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy'; // Make it clear this is a copy
        },
        
        onDragFileEnter: function(evt){
        	evt.preventDefault();
        	//$('#drop-zone', this.$el).show();
        	//$('#drop-zone', this.$el).height($('#lookup-table', this.$el).height());
        	//$('#lookup-table', this.$el).addClass('drop-target');
        	return false;
        },
        
        onDragFileEnd: function(){
        	console.log("Dragging stopped");
        	this.$el.removeClass('dragging');
        },
        
        /**
         * Import the dropped file.
         */
        onDropFile: function(evt){
        	
        	console.log("Got a file via drag and drop");
        	evt.stopPropagation();
            evt.preventDefault();
            var files = evt.dataTransfer.files;
            
            this.importFile(evt);
        },
        
        /**
         * Import the given file into the lookup.
         */
        importFile: function(evt){
        	
        	// Stop if the browser doesn't support processing files in Javascript
        	if(!window.FileReader){
        		alert("Your browser doesn't support file reading in Javascript; thus, I cannot parse your uploaded file");
        		return false;
        	}
        	
        	// Get a reader so that we can read in the file
        	var reader = new FileReader();
        	
        	// Setup an onload handler that will process the file
        	reader.onload = function(evt) {
        		
        		console.log("Running file reader onload handler");
        		
        		// Stop if the ready state isn't "loaded"
                if(evt.target.readyState != 2){
                	return;
                }
                
                // Stop if the file could not be processed
                if(evt.target.error) {
                	
                	// Hide the loading message
                	$(".table-loading-message").hide();
                	
                	// Show an error
                    this.showWarningMessage("Unable to import the file");
                    return;
                }
                
                // Get the file contents
                var filecontent = evt.target.result;
                
                // Import the file into the view
            	var data = new CSV(filecontent, { }).parse();
            	
            	// Render the lookup file
            	this.renderLookup(data);
            	
            	// Hide the import dialog
            	$('#import-file-modal', this.$el).modal('hide');
            	
            	// Show a message noting that the file was imported
            	this.showInfoMessage("File imported successfully");
            	
        	}.bind(this);
        	
        	var files = [];
        	
        	// Get the files from the file input widget if available
        	if(evt.target.files && evt.target.files.length > 0){
        		files = evt.target.files;
        	}
        	
        	// Get the files from the drag & drop if available
        	else if(evt.dataTransfer && evt.dataTransfer.files.length > 0){
        		files = evt.dataTransfer.files;
        	}
        	
            // Stop if no files where provided (user likely pressed cancel)
            if(files.length > 0 ){
        	    
        	    // Set the file name if this is a new file and a filename was not set yet
        	    if(this.is_new && (!mvc.Components.getInstance("lookup-name").val() || mvc.Components.getInstance("lookup-name").val().length <= 0)){
        	    	mvc.Components.getInstance("lookup-name").val(files[0].name);
        	    }
        	    
        	    // Start the process of processing file
        	    reader.readAsText(files[0]);
            }
            else{
            	// Hide the loading message
            	$(".table-loading-message").hide();
            }
        	
        },
        
        /**
         * Render the list of backup files.
         */
        renderBackupsList: function(){
        	
        	var backup_list_template = '<a class="btn active btn-primary dropdown-toggle" data-toggle="dropdown" href="#"> \
        			Revert to previous version \
        			<span class="caret"></span> \
        		</a> \
        		<ul class="dropdown-menu"> \
        		<% for(var c = 0; c < backups.length; c++){ %> \
        			<li><a class="backup-version" href="#" data-backup-time="<%- backups[c].time %>"><%- backups[c].time_readable %></a></li> \
        		<% } %> \
        		<% if(backups.length == 0){ %> \
        			<li><a class="backup-version" href="#">No backup versions available</a></li> \
        		<% } %> \
        	</ul>';
        	
        	// Render the list of backups
        	$('#load-backup', this.$el).html(_.template(backup_list_template, {
        		'backups' : this.backups.toJSON()
        	}));
        	
        	// Show the list of backup lookups
        	$('#load-backup', this.$el).show();
        	
        },
        
        /**
         * Load the lookup file contents from the server and populate the editor.
         * 
         * @param lookup_file The name of the lookup file
         * @param namespace The app where the lookup file exists
         * @param user The user that owns the file (in the case of user-based lookups)
         * @param lookup_type Indicates whether this is a KV store or a CSV lookup (needs to be either "kv" or "csv")
         * @param header_only Indicates if only the header row should be retrieved
         * @param version The version to get from the archived history
         */
        loadLookupContents: function(lookup_file, namespace, user, lookup_type, header_only, version){
        	
        	// Set a default value for header_only
        	if( typeof header_only == 'undefined' ){
        		header_only = false;
        	}
        	
        	var data = {"lookup_file":lookup_file,
                    	"namespace"  :namespace,
                    	"header_only":header_only,
                    	"lookup_type":lookup_type};
        	
        	// Set a default value for version
        	if( typeof version == 'undefined' ){
        		version = undefined;
        	}
        	
        	// Show the loading message
        	$(".table-loading-message").show(); // TODO replace
        	
        	// Set the version parameter if we are asking for an old version
        	if( version !== undefined && version ){
        		data.version = version;
        	}
        	
        	// If a user was defined, then pass the name as a parameter
        	if(user !== null){
        		data["owner"] = user;
        	}
        	
        	// Make the URL
            url = Splunk.util.make_full_url("/custom/lookup_editor/lookup_edit/get_lookup_contents", data);
        	
        	// Started recording the time so that we figure out how long it took to load the lookup file
        	var populateStart = new Date().getTime();
        	
        	// Perform the call
        	$.ajax({
        		  url: url,
        		  cache: false,
        		  
        		  // On success, populate the table
        		  success: function(data) {
        			  console.info('JSON of lookup table was successfully loaded');
        			  this.renderLookup(data);
        			  
        			  var elapsed = new Date().getTime()-populateStart;
        			  console.info("Lookup loaded and rendered in " + elapsed + "ms");
        			  
        			  // Remember the specs on the loaded file
        			  this.lookup = lookup_file;
        	          this.namespace = namespace;
        	          this.owner = user;
        	          this.lookup_type = lookup_type;
        			  
        		  }.bind(this),
        		  
        		  // Handle cases where the file could not be found or the user did not have permissions
        		  complete: function(jqXHR, textStatus){
        			  if( jqXHR.status == 404){
        				  console.info('Lookup file was not found');
        				  this.showWarningMessage("The requested lookup file does not exist", true);
        			  }
        			  else if( jqXHR.status == 403){
        				  console.info('Inadequate permissions');
        				  this.showWarningMessage("You do not have permission to view this lookup file", true);
        			  }
        			  else if( jqXHR.status == 420){
        				  console.info('File is too large');
        				  this.showWarningMessage("The file is too big to be edited (must be less than 10 MB)");
        			  }
        			  
        			  // Hide the loading message
        			  $(".table-loading-message").hide();
        			  
        			  // Start the loading of the history
        			  if( version === undefined && this.lookup_type === "csv" ){
        				  this.loadLookupBackupsList(lookup_file, namespace, user);
        			  }
        			  else if(this.lookup_type === "csv"){
        				  // Show a message noting that the backup was imported
        				  this.showInfoMessage("Backup file was loaded successfully");
        			  }
        			  
        		  }.bind(this),
        		  
        		  // Handle errors
        		  error: function(jqXHR, textStatus, errorThrown){
        			  if( jqXHR.status != 404 && jqXHR.status != 403 && jqXHR.status != 420 ){
        				  console.info('Lookup file could not be loaded');
        				  this.showWarningMessage("The lookup could not be loaded from the server", true);
        			  }
        		  }.bind(this)
        	});
        },
        
        /**
         * Validate that the lookup contents are a valid file
         * 
         * @param data The data (array of array) representing the table
         * @returns {Boolean}
         */
        validate: function(data) {
        	
        	// If the cell is the first row, then ensure that the new value is not blank
        	if( data[0][0] === 0 && data[0][3].length === 0 ){
        		return false;
        	}
        },
        
        /**
         * Validate the content of the form
         */
        validateForm: function(){
        	
        	var issues = 0;
        	
        	// By default assume everything passes
        	$('#lookup-name-control-group', this.$el).removeClass('error');
        	$('#lookup-app-control-group', this.$el).removeClass('error');
        	
        	this.hideWarningMessage();
        	
        	if(this.is_new && (!mvc.Components.getInstance("lookup-name").val() || mvc.Components.getInstance("lookup-name").val().length <= 0)){
        		$('#lookup-name-control-group', this.$el).addClass('error');
        		this.showWarningMessage("Please enter a lookup name");
        		issues = issues + 1;
        	}
        	else if(this.is_new && !mvc.Components.getInstance("lookup-name").val().match(/^[-A-Z0-9_ ]+([.][-A-Z0-9_ ]+)*$/gi)){
        		$('#lookup-name-control-group', this.$el).addClass('error');
        		this.showWarningMessage("Lookup name is invalid");
        		issues = issues + 1;
        	}
        	
        	if(this.is_new && (! mvc.Components.getInstance("lookup-app").val() || mvc.Components.getInstance("lookup-app").val().length <= 0)){
        		$('#lookup-app-control-group', this.$el).addClass('error');
        		this.showWarningMessage("Select the app where the lookup will reside");
        		issues = issues + 1;
        	}
        	
        	// Determine if the validation passed
        	if(issues > 0){
        		return false;
        	}
        	else{
        		return true;
        	}
        },
        
        /**
         * Get the list of apps as choices.
         */
        getAppsChoices: function(){
        	
        	// If we don't have the apps yet, then just return an empty list for now
        	if(!this.apps){
        		return [];
        	}
        	
        	var choices = [];
        	
        	for(var c = 0; c < this.apps.models.length; c++){
        		choices.push({
        			'label': this.apps.models[c].entry.associated.content.attributes.label,
        			'value': this.apps.models[c].entry.attributes.name
        		});
        	}
        	
        	return choices;
        	
        },
        
        /**
         * Got the lookup information
         */
        gotLookupInfo: function(){
        	debugger;
        	
        },
        
        /**
         * Get the apps
         */
        gotApps: function(){
        	
        	// Update the list
        	if(mvc.Components.getInstance("lookup-app")){
        		mvc.Components.getInstance("lookup-app").settings.set("choices", this.getAppsChoices());
        	}
        	
        },
        
        /**
         * Set the title of the save button
         */
        setSaveButtonTitle: function(title){
        	
        	if(typeof title == 'undefined' ){
        		$("#save").text("Save Lookup");
        	}
        	else{
        		$("#save").text(title);
        	}
        	
        },
        
        /**
         * Load the selected backup.
         */
        doLoadBackup: function(evt){
        	var version = evt.currentTarget.dataset.backupTime;
        	
        	if(version){
        		this.loadBackupFile(version);
        	}
        	
        },
        
        /**
         * Perform the operation to save the lookup
         * 
         * @returns {Boolean}
         */
        doSaveLookup: function(evt){
        	
        	// Determine if we are making a new entry
        	var making_new_lookup = this.is_new;
        	
        	// Change the title
        	this.setSaveButtonTitle("Saving...");
        	
        	// Started recording the time so that we figure out how long it took to save the lookup file
        	var populateStart = new Date().getTime();
        	
        	// Get a reference to the handsontable plugin
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// Get the row data
        	row_data = handsontable.getData();
        	
        	// Convert the data to JSON
        	json = JSON.stringify(row_data);
        	
        	// Make the arguments
        	var data = {
        			lookup_file : this.lookup,
        			namespace   : this.namespace,
        			contents    : json
        	};

        	// If a user was defined, then pass the name as a parameter
        	if(this.owner !== null){
        		data["owner"] = this.owner;
        	}
        	
        	// Hide the warnings. We will repost them if the input is still invalid
        	this.hideMessages();
        	
        	// Stop if the form didn't validate
        	if(!this.validateForm()){
        		this.setSaveButtonTitle();
        		return;
        	}
        	
        	// Validate the input if it is new
        	if(making_new_lookup){
        		
	        	// Get the lookup file name from the form if we are making a new lookup
        		data["lookup_file"] = mvc.Components.getInstance("lookup-name").val();
	
	        	// Make sure that the file name was included; stop if it was not
	        	if (data["lookup_file"] === ""){
	        		$("#lookup_file_error").text("Please define a file name"); // TODO
	        		$("#lookup_file_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        	
	        	// Make sure that the file name is valid; stop if it is not
	        	if( !data["lookup_file"].match(/^[-A-Z0-9_ ]+([.][-A-Z0-9_ ]+)*$/gi) ){
	        		$("#lookup_file_error").text("The file name contains invalid characters"); // TODO
	        		$("#lookup_file_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        		
	        	// Get the namespace from the form if we are making a new lookup
	        	data["namespace"] = mvc.Components.getInstance("lookup-app").val();
	
	        	// Make sure that the namespace was included; stop if it was not
	        	if (data["namespace"] === ""){
	        		$("#lookup_namespace_error").text("Please define a namespace");
	        		$("#lookup_namespace_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        }

        	// Make sure at least a header exists; stop if not enough content is present
        	if(row_data.length === 0){		
        		this.showWarningMessage("Lookup files must contain at least one row (the header)");
        		return false;
        	}
        	
        	// Make sure the headers are not empty.
        	// If the editor is allowed to add extra columns then ignore the last row since this for adding a new column thus is allowed
        	for( i = 0; i < row_data[0].length; i++){
        		
        		// Determine if this row has an empty header cell
        		if( row_data[0][i] === "" ){
        			this.showWarningMessage("Header rows cannot contain empty cells (column " + (i + 1) + " of the header is empty)");
        			return false;
        		}
        	}
        	
        	// Perform the request to save the lookups
        	$.ajax( {
        				url:  Splunk.util.make_url('/custom/lookup_editor/lookup_edit/save'),
        				type: 'POST',
        				data: data,
        				
        				success: function(){
        					console.log("Lookup file saved successfully");
        					this.showInfoMessage("Lookup file saved successfully");
        					this.setSaveButtonTitle();
        					
        					// Persist the information about the lookup
        					if(this.is_new){
	        					this.lookup = data["lookup_file"];
	        					this.namespace = data["namespace"];
	        					this.owner = data["owner"];
        					}
        				}.bind(this),
        				
        				// Handle cases where the file could not be found or the user did not have permissions
        				complete: function(jqXHR, textStatus){
        					
        					var elapsed = new Date().getTime()-populateStart;
        					console.info("Lookup save operation completed in " + elapsed + "ms");
        					var success = true;
        					
        					if(jqXHR.status == 404){
        						console.info('Lookup file was not found');
        						this.showWarningMessage("This lookup file could not be found");
        						success = false;
        					}
        					else if(jqXHR.status == 403){
        						console.info('Inadequate permissions');
        						this.showWarningMessage("You do not have permission to edit this lookup file");
        						success = false;
        					}
        					else if(jqXHR.status == 400){
        						console.info('Invalid input');
        						this.showWarningMessage("This lookup file could not be saved because the input is invalid");
        						success = false;
        					}
        					else if(jqXHR.status == 500){
        						this.showWarningMessage("The lookup file could not be saved");
        				    	success = false;
        					}
        					
        					this.setSaveButtonTitle();
        					
        					// If we made a new lookup, then switch modes
        					if(this.is_new){
        						this.changeToEditMode();
        					}
        					
        					// Update the lookup backup list
        					if(success){
        						this.loadLookupBackupsList(this.lookup, this.namespace, this.owner);
        					}
        				}.bind(this),
        				
        				error: function(jqXHR,textStatus,errorThrown) {
        					console.log("Lookup file not saved");
        					this.showWarningMessage("Lookup file could not be saved");
        				}.bind(this)
        				
        			}
        	);
        	
        	return false;
        },
        
        /**
         * Do an edit to a row cell (for KV store lookups since edits are dynamic).
         */
        doEditCell: function(row, col, new_value){
        	
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// First, we need to get the _key of the edited row
        	var row_data = handsontable.getDataAtRow(row);
        	var _key = row_data[0];
        	
        	// Second, we need to get all of the data from the given row because we must re-post all of the cell data
        	var record_data = this.makeRowJSON(row);
        	
        	// If _key doesn't exist, then we will create a new row
        	var url = Splunk.util.make_url("/splunkd/servicesNS/" + this.owner + "/" + this.namespace +  "/storage/collections/data/" + this.lookup + "/" + _key);
        	
        	if(!_key){
        		url = Splunk.util.make_url("/splunkd/servicesNS/" + this.owner + "/" + this.namespace +  "/storage/collections/data/" + this.lookup);
        	}
        	
        	// Third, we need to do a post to update the row
        	$.ajax({
        		url: url,
        		type: "POST",
        		dataType: "json",
        		data: JSON.stringify(record_data),
        		contentType: "application/json; charset=utf-8",
        		
      		  	// On success
      		  	success: function(data) {
      		  		
      		  		if(data){
      		  			console.info('KV store entry edit completed for entry ' + _key);
      		  		}
      		  		
      		  	}.bind(this),
      		  
      		  	// On complete
      		  	complete: function(jqXHR, textStatus){
      		  		
      		  		if( jqXHR.status == 403){
      		  			console.info('Inadequate permissions');
      		  			this.showWarningMessage("You do not have permission to edit this lookup", true);
      		  		}
      		  	
      		  	}.bind(this),
      		  	
      		  	// Handle errors
      		  	error: function(jqXHR, textStatus, errorThrown){
      		  		
      		  		
      		  		this.showWarningMessage("An entry could not be saved to the KV store lookup", true);
      		  	}.bind(this)
        	});
        },
        
        /**
         * Do the removal of a row (for KV store lookups since edits are dynamic).
         */
        doRemoveRow: function(row){
        	
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// First, we need to get the _key of the edited row
        	var row_data = handsontable.getDataAtRow(row);
        	var _key = row_data[0];
        	
        	// Second, we need to do a post to remove the row
        	$.ajax({
        		url: Splunk.util.make_url("/splunkd/servicesNS/" + this.owner + "/" + this.namespace +  "/storage/collections/data/" + this.lookup + "/" + _key),
        		type: "DELETE",
        		
      		  	// On success
      		  	success: function(data) {
      		  		console.info('KV store entry removal completed for entry ' + _key);
      		  	}.bind(this),
      		  	
      		  	// On complete
      		  	complete: function(jqXHR, textStatus){
      		  		
      		  		if( jqXHR.status == 403){
      		  			console.info('Inadequate permissions');
      		  			this.showWarningMessage("You do not have permission to edit this lookup", true);
      		  		}
      		  	
      		  	}.bind(this),
      		  
      		  	// Handle errors
      		  	error: function(jqXHR, textStatus, errorThrown){
      		  		this.showWarningMessage("An entry could not be removed from the KV store lookup", true);
      		  	}.bind(this)
        	});
        },
        
        /**
         * Add the given field to the data with the appropriate hierarchy.
         */
        addFieldToJSON: function(json_data, field, value){
        	
        	var split_field = [];
        	
        	split_field = field.split(".");
        	
    		// If the field has a period, then this is hierarchical field
    		// For these, we need to build the heirarchy or make sure it exists.
    		if(split_field.length > 1){
    			
    			// If the top-most field doesn't exist, create it
    			if(!(split_field[0] in json_data)){
    				json_data[split_field[0]] = {};
    			}
    			
    			// Recurse to add the children
    			return this.addFieldToJSON(json_data[split_field[0]], split_field.slice(1).join("."), value);
    		}
    		
    		// For non-hierarchical fields, we can just add them
    		else{
    			json_data[field] = value;
    			
    			// This is the base case
    			return json_data;
    		}
        	
        },
        
        /**
         * Make JSON for the given row.
         */
        makeRowJSON: function(row){
        	
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// We need to get the row meta-data and the 
        	var row_header = handsontable.getDataAtRow(0);
        	var row_data = handsontable.getDataAtRow(row);
        	
        	// This is going to hold the data for the row
        	var json_data = {};
        	
        	// Add each field / column
        	for(var c=1; c < row_header.length; c++){
        		this.addFieldToJSON(json_data, row_header[c], row_data[c] || '');
        	}
        	
        	// Return the created JSON
        	return json_data;
        },
        
        /**
         * Do the creation of a row (for KV store lookups since edits are dynamic).
         */
        doCreateRows: function(row, count){
        	
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// Create entries for each row to create
        	var record_data = [];
        	
        	for(var c=0; c < count; c++){
        		record_data.push(this.makeRowJSON(row + c));
        	}
        	
        	// Third, we need to do a post to create the row
        	$.ajax({
        		url: Splunk.util.make_url("/splunkd/servicesNS/" + this.owner + "/" + this.namespace +  "/storage/collections/data/" + this.lookup + "/batch_save"),
        		type: "POST",
        		dataType: "json",
        		data: JSON.stringify(record_data),
        		contentType: "application/json; charset=utf-8",
        		
      		  	// On success
      		  	success: function(data) {
      		  		// Update the _key values in the cells
      		  		for(var c=0; c < data.length; c++){
      		  			handsontable.setDataAtCell(row + c, 0, data[c], "key_update")
      		  		}
      		  		
      		  	}.bind(this),
      		  	
      		  	// On complete
      		  	complete: function(jqXHR, textStatus){
      		  		
      		  		if( jqXHR.status == 403){
      		  			console.info('Inadequate permissions');
      		  			this.showWarningMessage("You do not have permission to edit this lookup", true);
      		  		}
      		  	
      		  	}.bind(this),
      		  
      		  	// Handle errors
      		  	error: function(jqXHR, textStatus, errorThrown){
      		  		this.showWarningMessage("Entries could not be saved to the KV store lookup", true);
      		  	}.bind(this)
        	});
        },
        
        /**
         * Render the lookup.
         */
        renderLookup: function(data){
        	
        	var renderer = this.lookupRenderer.bind(this);
        	
        	// If we are editing a CSV, use these menu options
        	var contextMenu = {
      			items: ['row_above', 'row_below', '---------', 'col_left', 'col_right', '---------', 'remove_row', 'remove_col', '---------', 'undo', 'redo']
    		};
    		
    		// If we are editing a KV store lookup, use these menu options
        	if(this.lookup_type === "kv"){
	    		contextMenu = {
	    				items: {
	    					'row_above': {
	    						disabled: function () {
	    				            // If read-only or the first row, disable this option
	    				            return this.read_only || $("#lookup-table").data('handsontable').getSelected()[0] === 0;
	    				        }
	    					},
	    					'row_below': {
	    						disabled: function () {
	    				            return this.read_only;
	    				        }
	    					},
	    					"hsep1": "---------",
	    					'remove_row': {
	    						disabled: function () {
	    							// If read-only or the first row, disable this option
	    				            return this.read_only ||$("#lookup-table").data('handsontable').getSelected()[0] === 0;
	    				        }
	    					},
	    					'hsep2': "---------",
	    					'undo': {
	    						disabled: function () {
	    				            return this.read_only;
	    				        }
	    					},
	    					'redo': {
	    						disabled: function () {
	    				            return this.read_only;
	    				        }
	    					}
	    				}
	    		}
        	}
        	
        	$("#lookup-table").handsontable({
        		  data: data,
        		  startRows: 1,
        		  startCols: 1,
        		  contextMenu: contextMenu,
        		  minSpareRows: 0,
        		  minSpareCols: 0,
        		  colHeaders: false,
        		  rowHeaders: true,
        		  fixedRowsTop: 1,
        		  
        		  stretchH: 'all',
        		  manualColumnResize: true,
        		  manualColumnMove: true,
        		  onBeforeChange: this.validate.bind(this),
        		  
        		  allowInsertColumn: false,
        		  allowRemoveColumn: false,
        		  
        		  cells: function(row, col, prop) {
        			  this.renderer = renderer;
        			  
        			  var cellProperties = {};
        			  
        			  // Don't allow the _key row or the header to be editable on KV store lookups (since the schema is unchangable and the keys are auto-assigned)
        		      if (this.read_only || (this.lookup_type === "kv" && (row == 0 || col == 0))) {
        		        cellProperties.readOnly = true;
        		      }

        		      return cellProperties;
        		  }.bind(this),
        		
        		  beforeRemoveRow: function(index, amount){
        			  
        			  // Don't allow deletion of all cells
        			  if( (this.countRows() - amount) <= 0){
        				  alert("A valid lookup file requires at least one row (for the header).");
        				  return false;
        			  }
        			  
        			  // Warn about the header being deleted and make sure the user wants to proceed.
        			  if(index == 0){
        				  var continue_with_deletion = confirm("Are you sure you want to delete the header row?\n\nNote that a valid lookup file needs at least a header.");
        				  
        				  if (!continue_with_deletion){
        					  return false;
        				  }
        			  }
        		  },
        		  
        		  beforeRemoveCol: function(index, amount){
        			  
        			  // Don't allow deletion of all cells
        			  if( (this.countCols() - amount) <= 0){
        				  alert("A valid lookup file requires at least one column.");
        				  return false;
        			  }
        		  },
        		  
        		  // Don't allow removal of all columns
        		  afterRemoveCol: function(index, amount){
        			  if(this.countCols() == 0){
        				  alert("You must have at least one cell to have a valid lookup");
        				  //this.renderLookup( [ [""] ] );
        			  }
        		  }
            });
        	
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// Wire-up handlers for doing KV store dynamic updates
        	if(this.lookup_type === "kv"){
        		
        		// For cell edits
	        	handsontable.addHook('afterChange', function(changes, source) {
	        		
	        		// Ignore changes caused by the script updating the _key for newly added rows
	        		if(source === "key_update"){
	        			return;
	        		}
	        		
	        		// Iterate and change each cell
	        		for(var c = 0; c < changes.length; c++){
		        		var row = changes[c][0];
		        		var col = changes[c][1];
		        		var new_value = changes[c][3];
		        		
		        		this.doEditCell(row, col, new_value);
	        		}

	        	}.bind(this));
	        	
	        	// For row removal
	        	handsontable.addHook('beforeRemoveRow', function(index, amount) {
	        		
	        		// Iterate and remove each row
	        		for(var c = 0; c < amount; c++){
		        		var row = index + c;		        		
		        		this.doRemoveRow(row);
	        		}

	        	}.bind(this));
	        	
	        	// For row creation
	        	handsontable.addHook('afterCreateRow', this.doCreateRows.bind(this));
        	}
        	
        },
        
        /**
         * Get the parameter with the given name.
         */
        getParameterByName: function(name) {
            name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
            
            var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
                results = regex.exec(location.search);
            
            return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        },
        
        /**
         * Hide the given item while retaining the display value
         */
        hide: function(selector){
        	selector.css("display", "none");
        	selector.addClass("hide");
        },
        
        /**
         * Un-hide the given item.
         * 
         * Note: this removes all custom styles applied directly to the element.
         */
        unhide: function(selector){
        	selector.removeClass("hide");
        	selector.removeAttr("style");
        },
        
        /**
         * Change from the new mode of the editor to the edit mode
         */
        changeToEditMode: function(){
        	
        	// Set the lookup name
        	$('#lookup-name-static', this.$el).text(this.lookup);
        	this.unhide($('#lookup-name-static', this.$el));
        	
        	// Hide the creation controls
        	this.hide($('.show-when-creating', this.$el));
        	
        	// Change the title
        	$('h2', this.$el).text("Edit Lookup");
        	
        	// Remember that we are not editing a file
			this.is_new = false;
			
			// Change the URL
			var url = "?lookup=" + this.lookup + "&namespace=" + this.namespace;
			
			if(this.owner){
				url += "&owner=" + this.owner;
			}
			else{
				url += "&owner=nobody";
			}
			
			history.pushState(null, "Lookup Edit",url);
        },
        
        /**
         * Render the page.
         */
        render: function () {
        	
        	// Get the information from the lookup to load
        	this.lookup = this.getParameterByName("lookup");
        	this.namespace = this.getParameterByName("namespace");
        	this.owner = this.getParameterByName("owner");
        	this.lookup_type = this.getParameterByName("type");
        	
        	// Get the info about the lookup configuration (for KV store lookups)
        	if(this.lookup_type === "kv"){
        		
	        	this.lookup_config = new KVLookup();
	        	
	        	this.lookup_config.fetch({
	        		// e.g. servicesNS/nobody/lookup_editor/storage/collections/config/test
	        		url: splunkd_utils.fullpath(['/servicesNS', this.owner, this.namespace, 'storage/collections/config', this.lookup].join('/')),
	                success: function(model, response, options) {
	                    console.info("Successfully retrieved the information about the KV store lookup");
	                    
	                    // If this lookup cannot be edited, then set the editor to read-only
	                    if(!model.entry.acl.attributes.can_write){
	                    	this.read_only = true;
	                    	this.showWarningMessage("You do not have permission to edit this lookup; it is being displayed read-only");
	                    	
	                    	// Re-render the view so that the cells show that it is read-only
	                    	if($("#lookup-table").length > 0 && $("#lookup-table").data('handsontable')){
		                    	var handsontable = $("#lookup-table").data('handsontable');
		                    	
		                    	if(handsontable){
		                    		handsontable.render(); 
		                    	}
	                    	}
	                    }
	                    
	                }.bind(this),
	                error: function() {
	                	console.warn("Unable to retrieve the information about the KV store lookup");
	                }.bind(this)
	        	});
        	}
        	
        	this.is_new = false;
        	
        	// Determine if we are making a new lookup
        	if(this.lookup == "" && this.namespace == "" && this.owner == ""){
        		this.is_new = true;
        	}
        	
        	// Render
        	this.$el.html(_.template(Template, {
        		'insufficient_permissions' : false,
        		'is_new' : this.is_new,
        		'lookup_name': this.lookup,
        		'lookup_type' : this.lookup_type
        	}));
        	
            // Show the content that is specific to making new lookups
        	if(this.is_new){
        		
	        	// Make the lookup name input
	        	var name_input = new TextInput({
	                "id": "lookup-name",
	                "searchWhenChanged": false,
	                "el": $('#lookup-name', this.$el)
	            }, {tokens: true}).render();
        		
	        	name_input.on("change", function(newValue) {
                	this.validateForm();
                }.bind(this));
        		
	        	// Make the app selection drop-down
                var app_dropdown = new DropdownInput({
                    "id": "lookup-app",
                    "selectFirstChoice": false,
                    "showClearButton": false,
                    "el": $('#lookup-app', this.$el),
                    "choices": this.getAppsChoices()
                }, {tokens: true}).render();
                
                app_dropdown.on("change", function(newValue) {
                	this.validateForm();
                }.bind(this));
        	}

        	// Setup the handlers so that we can make the view support drag and drop
            this.setupDragDropHandlers();
            
        	// Set the window height so that the user doesn't have to scroll to the bottom to set the save button
        	$('#lookup-table').height($(window).height() - 320);
        	
        	// Show a default lookup if this is a new lookup
        	if(this.is_new){
        		
        		var data = [
        		            ["Column1", "Column2", "Column3", "Column4", "Column5", "Column6"],
        		            ["", "", "", "", "", ""],
        		            ["", "", "", "", "", ""],
        		            ["", "", "", "", "", ""],
        		            ["", "", "", "", "", ""]
        		          ];
        		
        		this.renderLookup(data);
        	}
        	
        	// Stop if we didn't get enough information to load a lookup
        	else if(this.lookup == "" || this.namespace == "" || this.owner == ""){
        		this.showWarningMessage("Not enough information to identify the lookup file to load");
        	}
        	
        	// Load the lookup
        	else{
        		this.loadLookupContents(this.lookup, this.namespace, this.owner, this.lookup_type);
        	}
        	
        }
    });
    
    return LookupEditView;
});