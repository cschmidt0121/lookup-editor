Splunk.Module.LookupFileLister = $.klass(Splunk.Module, {
	
    initialize: function($super,container) {
        var retVal = $super(container);
        
    	// Get the name of the view to redirect to and save it so that we can redirect
    	//$('#returnto').val( this.getParam('editView') );
        
        // Get a reference to the form
        var formElement = $('form', this.container);
        
        // Update the form call with an Ajax request submission
        formElement.submit(function(e) {
        	
        	// Initiate the Ajax request
            try {
                $(this).ajaxSubmit({
                	
                	// Upon the successful processing of the Ajax request, evaluate the response to determine if the status was created
                    'success': function(json) {
                		var messenger;
                		
                		// If successful, print a message noting that it was successful
                        if (json["success"]) {
                        	
                        	// Print a message noting that the change was successfully made
                        	messenger = Splunk.Messenger.System.getInstance();
                        	messenger.send('info', "splunk.lookup_editor", json["message"]);
                        	
                        // If it was unsuccessful, then print an error message accordingly
                        } else {
                            messenger = Splunk.Messenger.System.getInstance();
                            messenger.send('error', "splunk.lookup_editor", _('ERROR - ') + json["message"] || json);
                        }
                    },
                    'dataType': 'json'
                });
                
            // The Ajax request failed, print an exception
            } catch(e) {
                alert(e);
            }

            return false;

        });
        
        return retVal;
    },
    
    handleSubmitCallback: function() {
    	var messenger = Splunk.Messenger.System.getInstance();
    	messenger.send('info', "splunk.lookup_editor", "Action succeeded");
    	
    }
});